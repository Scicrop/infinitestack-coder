package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infinitestack.notebook.entity.UserExceptionEntity;
import com.infinitestack.notebook.util.ProjectUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

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
}

// Record para receber o JSON do frontend
record CreateProjectRequest(String name) {}