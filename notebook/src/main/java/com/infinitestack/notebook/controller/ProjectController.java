package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infinitestack.notebook.dto.UserExceptionEntity;
import com.infinitestack.notebook.util.ProjectUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@RestController
@RequestMapping("/api/projects")
@CrossOrigin(origins = "*") // Permite chamadas do seu frontend local
public class ProjectController {

    private static final String PROJECTS_DIR = "/opt/infinitestack-notebook/projects";
    private final ObjectMapper objectMapper = new ObjectMapper();

    static {
        // Cria a pasta "projects" na raiz do projeto se não existir
        try {
            Files.createDirectories(Paths.get(PROJECTS_DIR));
        } catch (IOException e) {
            System.err.println("Erro ao criar pasta de projetos: " + e.getMessage());
        }
    }

    @GetMapping("/list")
    public ResponseEntity<List<Map<String, Object>>> listProjects() {
        try {
            Path projectsDir = Paths.get("/opt/infinitestack-notebook/projects");
            if (!Files.exists(projectsDir)) {
                Files.createDirectories(projectsDir);
            }

            List<Map<String, Object>> projects = new ArrayList<>();

            try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsDir)) {
                for (Path projectDir : stream) {
                    if (Files.isDirectory(projectDir)) {
                        Path projectFile = projectsDir.resolve(projectDir.getFileName() + ".json");
                        if (Files.exists(projectFile)) {
                            JsonNode json = objectMapper.readTree(projectFile.toFile());
                            String name = json.path("name").asText();
                            String displayName = json.has("displayName") ? json.path("displayName").asText() : name;
                            String createdAt = json.path("createdAt").asText("Desconhecido");

                            Map<String, Object> proj = new HashMap<>();
                            proj.put("name", name);
                            proj.put("displayName", displayName);
                            proj.put("createdAt", createdAt);
                            proj.put("fileCount", json.path("files").size());
                            proj.put("historyCount", json.path("history").size());

                            projects.add(proj);
                        }
                    }
                }
            }

            // Ordena por data de criação (mais recente primeiro)
            projects.sort((a, b) -> b.get("createdAt").toString().compareTo(a.get("createdAt").toString()));

            return ResponseEntity.ok(projects);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Collections.emptyList());
        }
    }

    @PostMapping("/create")
    public ResponseEntity<?> createProject(@RequestBody CreateProjectRequest request) {
        try {
            // 1. Validação rigorosa (lança ResponseStatusException se inválido)
            ProjectUtils.isValidGitRepoName(request.name());

            String projectName = request.name().trim();
            String filename = projectName + ".json";
            Path projectDirPath = Paths.get(PROJECTS_DIR, projectName);
            Path projectRootPath = Paths.get(PROJECTS_DIR);
            Path filePath = projectRootPath.resolve(filename);


            if (Files.exists(filePath)) {
                JsonNode existing = objectMapper.readTree(filePath.toFile());
                return ResponseEntity.ok(existing);
            }

            // Cria o diretório do projeto se não existir
            if (!Files.exists(projectDirPath)) {
                Files.createDirectories(projectDirPath);
            }

            // Cria o projeto
            ObjectNode projectJson = objectMapper.createObjectNode();
            projectJson.put("name", projectName);
            projectJson.put("displayName", request.name());
            projectJson.put("createdAt", java.time.Instant.now().toString());
            projectJson.put("language", "python");
            projectJson.put("openAiKey", "");
            projectJson.put("model", "gpt-4o");
            projectJson.set("files", objectMapper.createArrayNode());
            projectJson.set("history", objectMapper.createArrayNode());

            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(filePath.toFile(), projectJson);

            return ResponseEntity.status(HttpStatus.CREATED).body(projectJson);

        } catch (ResponseStatusException ex) {
            // Erro de validação → retorna seu record bonitinho com 400
            UserExceptionEntity error = new UserExceptionEntity(
                    "Requisição Inválida",
                    ex.getReason() != null ? ex.getReason() : "Parâmetro inválido"
            );
            return ResponseEntity.status(ex.getStatusCode()).body(error);

        } catch (Exception ex) {
            // Qualquer outro erro → 500 com seu record
            UserExceptionEntity error = new UserExceptionEntity(
                    "Erro Interno",
                    "Não foi possível criar o projeto. Tente novamente."
            );
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @GetMapping("/files/list")
    public ResponseEntity<?> listFilesFromPath(@RequestParam String root) {
        try {
            Path rootPath = Paths.get(root).normalize().toAbsolutePath();

            if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
                return ResponseEntity.badRequest()
                        .body(new UserExceptionEntity("Pasta não existe",
                                "O caminho informado não é uma pasta válida: " + root));
            }

            Set<String> allowedExt = Set.of(
                    "txt","md","csv","json","java","py","js","ts","html","css",
                    "xml","yml","yaml","sql","sh","properties","log","conf","env", "ipynb"
            );

            List<String> filePaths = new ArrayList<>();

            // NÃO RECURSIVO — só arquivos diretos da pasta
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(rootPath)) {
                for (Path entry : stream) {
                    if (Files.isRegularFile(entry)) {
                        String fileName = entry.getFileName().toString();
                        String ext = fileName.contains(".") ?
                                fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase() : "";

                        if (allowedExt.contains(ext)) {
                            String fullPath = entry.toAbsolutePath().toString().replace("\\", "/");

                            if (fullPath.contains(" ") ||
                                    fullPath.contains("\"") ||
                                    fullPath.contains("'") ||
                                    fullPath.contains("(") ||
                                    fullPath.contains(")") ||
                                    fullPath.contains("[") ||
                                    fullPath.contains("]") ||
                                    fullPath.contains("{") ||
                                    fullPath.contains("}") ||
                                    fullPath.contains(",") ||
                                    fullPath.contains(";")) {

                                fullPath = "\"" + fullPath.replace("\"", "\\\"") + "\"";
                            }

                            filePaths.add(fullPath);
                        }
                    }
                }
            }

            filePaths.sort(String::compareToIgnoreCase);

            return ResponseEntity.ok(filePaths);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro", "Falha ao listar arquivos: " + e.getMessage()));
        }
    }

    @GetMapping(path = "/{projectName}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> loadProject(@PathVariable String projectName) {
        try {
            ProjectUtils.isValidGitRepoName(projectName);

            Path projectFile = Paths.get("/opt/infinitestack-notebook/projects", projectName.trim() + ".json");

            if (!Files.exists(projectFile)) {
                String error = """
                {"ExceptionTitle":"Projeto não encontrado","ExceptionMessage":"O projeto '%s' não existe."}
                """.formatted(projectName);
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(error);
            }

            JsonNode projectJson = objectMapper.readTree(projectFile.toFile());

            // Garante displayName
            if (!projectJson.has("displayName") || projectJson.path("displayName").asText().isEmpty()) {
                ((ObjectNode) projectJson).put("displayName", projectName);
            }

            // FORÇA O JSON COMO STRING — O SPRING NÃO MEXE MAIS
            String jsonString = objectMapper.writeValueAsString(projectJson);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(jsonString);

        } catch (ResponseStatusException ex) {
            String error = """
            {"ExceptionTitle":"Nome inválido","ExceptionMessage":"%s"}
            """.formatted(ex.getReason());
            return ResponseEntity.status(ex.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(error);

        } catch (Exception e) {
            e.printStackTrace();
            String error = """
            {"ExceptionTitle":"Erro interno","ExceptionMessage":"Falha ao carregar o projeto."}
            """;
            return ResponseEntity.status(500)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(error);
        }
    }
}

// Record para receber o JSON do frontend
record CreateProjectRequest(String name) {}