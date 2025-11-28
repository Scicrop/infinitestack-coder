package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.web.bind.annotation.*;
import com.infinitestack.notebook.entity.UserExceptionEntity;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;


import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;


@RestController
@RequestMapping("/api/llm")
@CrossOrigin(origins = "*")
public class LLMController {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> payload) {
        String provider = (String) payload.get("provider");
        String model = (String) payload.get("model");
        String apiKey = (String) payload.get("apiKey");
        List<Map<String, String>> messages = (List<Map<String, String>>) payload.get("messages");
        String projectName = (String) payload.get("projectName"); // ← NOVO: vem do frontend

        if (!"openai".equals(provider)) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Provider não suportado", "Apenas OpenAI está habilitado."));
        }

        if (projectName == null || projectName.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Projeto não informado", "O campo 'projectName' é obrigatório."));
        }

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

            String tableDDL = (String) payload.get("tableDDL");
            if (tableDDL != null && !tableDDL.trim().isEmpty()) {
                finalMessages.add(Map.of("role", "system", "content", "ESTRUTURA DO BANCO (DDL da tabela selecionada):\n" + tableDDL.trim()));
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

            Map<String, Object> body = Map.of(
                    "model", model,
                    "messages", finalMessages,
                    "temperature", 0.3,
                    "max_tokens", 4000,
                    "response_format", Map.of("type", "json_object")
            );

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
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
            Path projectDir = Paths.get("/opt/infinitestack-notebook/projects");
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
            
            // Salva de bonito
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

}
