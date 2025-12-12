package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infinitestack.notebook.util.ProjectUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.infinitestack.notebook.dto.UserExceptionEntity;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;


import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;


@RestController
@RequestMapping("/api/llm")
@CrossOrigin(origins = "*")
public class LLMController {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> payload) throws IOException {
        String provider = (String) payload.get("provider");
        String model = (String) payload.get("model");
        String apiKey = (String) payload.get("apiKey");
        List<Map<String, String>> messages = (List<Map<String, String>>) payload.get("messages");
        String projectName = (String) payload.get("projectName");
        List<String> filePaths = (List<String>) payload.get("filePaths");
        String tableDDL = (String) payload.get("tableDDL");
        Integer countHistMsg = 0;
        try{
            String histMsg = (String) payload.get("histMsg");
            countHistMsg = Integer.parseInt(histMsg);
        } catch (NumberFormatException e) {

        }


        if (!"openai".equals(provider)) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Provider não suportado", "Apenas OpenAI está habilitado."));
        }

        if (projectName == null || projectName.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Projeto não informado", "O campo 'projectName' é obrigatório."));
        }

        Path projectDir = Paths.get("/opt/infinitestack-notebook/projects");
        Path projectInternalDir = projectDir.resolve(projectName.trim());


        try {
            // === MONTA MENSAGENS COM CONTEXTO (igual antes) ===
            List<Map<String, String>> finalMessages = new ArrayList<>();
            finalMessages.add(Map.of("role", "system", "content", """
            Você é um assistente de programação expert...
            
            INSTRUÇÕES OBRIGATÓRIAS:
            - Responda SEMPRE no formato JSON exato abaixo
            - Nunca use Markdown, nunca use blocos de código com ```
            
            Nunca adicione texto fora do JSON
            
            Formato obrigatório:
                {
                    "answers": [
                        {
                            "markdow_answer": ["linha 1", "linha 2", "..."],
                            "code_answer": [
                                {"type_lang": "python", "code": "def hello()..."},
                                {"type_lang": "sql", "code": "CREATE TABLE..."}
                            ]
                        }
                    ]
                }
            
                - Use a linguagem ou estrutura de dados solicitada pelo usuário.
                - Se houver README.md ou DDL de tabela, use como contexto para gerar código mais preciso.
                - Nunca responda em Markdown puro, explicações adicionais (como explicações de como fazer o uso da resposta) devem ser preenchidas na chave "markdow_answer": ["linha 1 do texto", "linha 2 do texto", "..."]
                - Nunca adicione explicações fora do JSON, explicações adicionais devem ser preenchidas na chave "markdow_answer": ["linha 1 do texto", "linha 2 do texto", "..."]
                - Nunca use ``` ou blocos de código
                - Sempre use esse JSON exato, mesmo que tenha apenas texto ou apenas código
                - Se não houver código, code_answer pode ser array vazio
                - Se não houver texto, markdow_answer pode ser array vazio
            """));

            String readmeContent = (String) payload.get("readmeContent");
            if (readmeContent != null && !readmeContent.trim().isEmpty()) {
                finalMessages.add(Map.of("role", "system", "content", "CONTEXTO DO PROJETO (README.md):\n" + readmeContent.trim()));
            }


            if (tableDDL != null && !tableDDL.trim().isEmpty()) {
                String database = (String) payload.get("database");
                String schema = (String) payload.get("schema");
                String tableName = (String) payload.get("tableName");
                finalMessages.add(Map.of("role", "system", "content", "Use essa ESTRUTURA da tabela ("+schema+"."+tableName+", do banco "+database+") selecionada, para compor sua resposta:\n" + tableDDL.trim()));
            }
            StringBuffer filesContext = new StringBuffer();
            if (filePaths != null && !filePaths.isEmpty()) {
                filesContext.append("\n\n=== ARQUIVOS DO CONTEXTO ===\n");
                for (String path : filePaths) {
                    try {
                        Path file = Paths.get(path).normalize();
                        if (Files.exists(file) && Files.isRegularFile(file)) {
                            String content = Files.readString(file, StandardCharsets.UTF_8);
                            String md5sum = ProjectUtils.md5OfFile(file);
                            System.out.println(md5sum);
                            filesContext.append("\n--- ARQUIVO: ").append(path).append(" ---\n")
                                    .append(content.length() > 8000
                                            ? content.substring(0, 8000) + "\n// ... (truncado)"
                                            : content)
                                    .append("\n--- FIM ---\n");
                        } else {
                            filesContext.append("\n--- ARQUIVO NÃO ENCONTRADO: ").append(path).append(" ---\n");
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                finalMessages.add(Map.of("role", "system", "content", filesContext.toString()));
            }

            String historyMsg = "";
            if(countHistMsg > 0 && countHistMsg <= 10){
                historyMsg = getHistory(countHistMsg, projectDir.resolve(projectName.trim()));
                finalMessages.add(Map.of("role", "system", "content", historyMsg));
            } else if (countHistMsg > 10) {
                historyMsg = getHistory(10, projectDir.resolve(projectName.trim()));
                finalMessages.add(Map.of("role", "system", "content", historyMsg));
            }


            String lang = (String) payload.get("language");
            if (lang != null && !lang.isEmpty()) {
                String langName = switch (lang) {
                    case "1" -> "Python";
                    case "2" -> "SQL";
                    case "3" -> "Java (Pure)";
                    case "4" -> "Java (with Springboot)";
                    case "5" -> "JSON";
                    default -> "qualquer linguagem";
                };
                finalMessages.add(Map.of("role", "system", "content", "O usuário quer a resposta preferencialmente em: " + langName));
            }

            finalMessages.addAll(messages);

            // === CHAMA A OPENAI ===
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + apiKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", finalMessages);

            requestBody.put("response_format", Map.of("type", "json_object"));

            if (model != null && (model.toLowerCase().contains("gpt-5"))) {

                requestBody.put("temperature", 1);
            } else {
                requestBody.put("max_tokens", 4000);
                requestBody.put("temperature", 0.3);
            }

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            RestTemplate rest = new RestTemplate();
            ResponseEntity<Map> openAiResponse = rest.exchange(
                    "https://api.openai.com/v1/chat/completions",
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            Map<String, Object> responseBody = openAiResponse.getBody();
            if (responseBody == null || !responseBody.containsKey("choices")) {
                throw new RuntimeException("Resposta inválida da OpenAI");
            }

            // === EXTRAI A RESPOSTA DO LLM ===
            LinkedHashMap<String, Object> choice = (LinkedHashMap<String, Object>) ((List<?>) responseBody.get("choices")).get(0);
            LinkedHashMap<String, Object> message = (LinkedHashMap<String, Object>) choice.get("message");
            String content = (String) message.get("content");

            JsonNode llmJsonResponse;
            try {
                llmJsonResponse = objectMapper.readTree(content);
            } catch (Exception e) {
                // Resposta de erro bonitinha e válida no formato esperado
                String errorResponse = """
                    {
                      "answers": [
                        {
                          "markdow_answer": [
                            "Erro ao processar resposta do modelo.",
                            "A resposta recebida não estava no formato JSON esperado.",
                            "Isso pode acontecer com prompts muito longos ou erros temporários do provedor.",
                            "Tente novamente ou simplifique o pedido."
                          ],
                          "code_answer": []
                        }
                      ]
                    }
                    """;
                llmJsonResponse = objectMapper.readTree(errorResponse);
            }

            // === MONTA OBJETO PARA SALVAR NO HISTÓRICO ===
            ObjectNode historyEntry = objectMapper.createObjectNode();
            historyEntry.put("timestamp", Instant.now().toString());
            historyEntry.put("provider", provider);
            historyEntry.put("model", model);
            // apiKey NUNCA salva! (segurança)
            historyEntry.set("messages", objectMapper.valueToTree(finalMessages));
            historyEntry.set("response", llmJsonResponse);

            // === SALVA NO ARQUIVO DO PROJETO ===

            Path projectFile = projectDir.resolve(projectName.trim() + ".json");

            JsonNode projectJson;
            if (Files.exists(projectFile)) {
                projectJson = objectMapper.readTree(projectFile.toFile());
            } else {
                return ResponseEntity.badRequest()
                        .body(new UserExceptionEntity("Projeto não encontrado", "O projeto '" + projectName + "' não existe."));
            }

            ArrayNode history = (ArrayNode) projectJson.path("history");
            history.add(historyEntry);

            Date now = new Date();
            String millis = String.valueOf(now.getTime());
            

            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(projectDir.resolve(projectName.trim()+ "/" + millis + ".json").toFile(), projectJson);

            // === RETORNA PARA O FRONTEND ===
            return ResponseEntity.ok(responseBody);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro ao processar Vibe!", e.getMessage()));
        }
    }

    private String getHistory(int countHistoryMsg, Path internalDir) throws IOException {
        String history = "";

        File directory = internalDir.toFile();
        if (!directory.isDirectory()) {
            throw new IllegalArgumentException("O caminho fornecido não é um diretório.");
        }


        List<String> filesArray = Arrays.stream(directory.listFiles())
                .filter(file -> file.getName().endsWith(".json"))
                .sorted(Comparator.comparingLong(File::lastModified).reversed())
                .limit(countHistoryMsg)
                .map(File::getName)
                .collect(Collectors.toList());


        for (String fileName : filesArray) {

            Path histFile = internalDir.resolve(fileName);
            JsonNode histJson = objectMapper.readTree(histFile.toFile());

            JsonNode userNode = histJson.path("history").get(0).path("messages").findValue("role");

            JsonNode msgsNode = histJson.path("history").get(0).path("messages");
            for (JsonNode msg : msgsNode) {
                if(msg.path("role").asText().equals("user")) {
                    history = history + "Lembrando, que o usuário perguntou: " +msg.path("content").asText() + "\n";
                }
            }

            JsonNode responseNode = histJson.path("history").get(0).path("response");
            JsonNode answersNode = responseNode.path("answers").get(0);
            history = history + "E o modelo respondeu: ";
            for (JsonNode markdown : answersNode.path("markdow_answer")) {
                history = history + markdown.asText() + "\n";
            }

            for (JsonNode code : answersNode.path("code_answer")) {
                String typeLang = code.path("type_lang").asText();
                String codeContent = code.path("code").asText();
                history = history + "["+ typeLang + "]: "+codeContent+ "\n\n";
            }

        }

        return history;
    }

}
