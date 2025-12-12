package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/llm")
@CrossOrigin(origins = "*")
public class LLMConfigController {

    private static final String PROVIDERS_FILE_PATH = "/opt/infinitestack-notebook/dist/llm-providers.json";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private JsonNode providersCache = null;
    private long lastLoaded = 0;

    private JsonNode loadProvidersFromFile() throws IOException {
        File file = new File(PROVIDERS_FILE_PATH);
        long lastModified = file.lastModified();

        if (providersCache == null || lastModified > lastLoaded) {
            if (!file.exists()) {
                throw new IOException("Arquivo llm-providers.json não encontrado: " + PROVIDERS_FILE_PATH);
            }
            providersCache = objectMapper.readTree(file);
            lastLoaded = lastModified;
        }
        return providersCache;
    }

    // CORRIGIDO: retorna List<Map<String, Object>> → Jackson serializa como JSON puro
    @GetMapping("/providers")
    public ResponseEntity<List<Map<String, Object>>> getProviders() throws IOException {
        JsonNode providersNode = loadProvidersFromFile().get("providers");
        List<Map<String, Object>> providers = objectMapper.convertValue(providersNode,
                objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class));
        return ResponseEntity.ok(providers);
    }

    // CORRIGIDO: retorna List<String> dos modelos
    @GetMapping("/models/{providerId}")
    public ResponseEntity<List<String>> getModels(@PathVariable String providerId) throws IOException {
        JsonNode root = loadProvidersFromFile();
        JsonNode providerNode = null;

        for (JsonNode p : root.get("providers")) {
            if (p.get("id").asText().equals(providerId)) {
                providerNode = p;
                break;
            }
        }

        if (providerNode == null) {
            return ResponseEntity.badRequest()
                    .body(null);
        }

        JsonNode modelsNode = providerNode.get("models");
        List<String> models = objectMapper.convertValue(modelsNode,
                objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));

        return ResponseEntity.ok(models);
    }
}