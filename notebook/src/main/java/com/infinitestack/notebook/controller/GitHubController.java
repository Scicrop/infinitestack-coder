package com.infinitestack.notebook.controller;

import com.infinitestack.notebook.entity.UserExceptionEntity;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.net.URI;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/github")
@CrossOrigin(origins = "*")
public class GitHubController {

    private final RestTemplate restTemplate = new RestTemplate();

    // Regex para extrair owner/repo de qualquer URL do GitHub
    private static final Pattern GITHUB_REPO_PATTERN = Pattern.compile(
            "github\\.com[/:]([^/]+)/(?!.*\\.git$)([^/]+?)(?:\\.git)?$"
    );

    @GetMapping("/readme")
    public ResponseEntity<?> getReadme(
            @RequestParam("token") String token,
            @RequestParam("repo") String repoUrl) {

        if (token == null || token.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Token ausente", "Forneça um GitHub Personal Access Token válido."));
        }

        if (repoUrl == null || repoUrl.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("URL inválida", "Forneça a URL do repositório GitHub."));
        }

        // Extrai owner/repo da URL
        String repoPath = extractRepoPath(repoUrl.trim());
        if (repoPath == null) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("URL inválida", "Não foi possível identificar o repositório GitHub."));
        }

        String apiUrl = "https://api.github.com/repos/" + repoPath + "/readme";

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "token " + token.trim());
            headers.set("Accept", "application/vnd.github.v3.raw"); // ← retorna Markdown puro!
            headers.set("User-Agent", "InfiniteStack-Notebook");    // obrigatório pro GitHub

            HttpEntity<String> entity = new HttpEntity<>(headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    apiUrl, HttpMethod.GET, entity, String.class);

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                return ResponseEntity.ok()
                        .contentType(MediaType.TEXT_PLAIN)
                        .body(response.getBody());
            } else {
                return ResponseEntity.status(response.getStatusCode())
                        .body(new UserExceptionEntity("Erro do GitHub", "README não encontrado ou inacessível."));
            }

        } catch (HttpClientErrorException e) {
            String msg = e.getMessage();
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                msg = "Repositório ou README não encontrado.";
            } else if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
                msg = "Acesso negado. Verifique o token (precisa de permissão 'repo' ou 'public_repo').";
            } else if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                msg = "Token inválido ou expirado.";
            }
            return ResponseEntity.status(e.getStatusCode())
                    .body(new UserExceptionEntity("Erro GitHub", msg));

        } catch (ResourceAccessException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new UserExceptionEntity("Sem conexão", "Não foi possível conectar ao GitHub."));

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new UserExceptionEntity("Erro interno", "Falha ao processar a requisição."));
        }
    }

    // Extrai "owner/repo" de qualquer URL válida do GitHub
    private String extractRepoPath(String url) {
        try {
            // Normaliza: remove protocolo, www, etc
            String clean = url.replaceFirst("^https?://(www\\.)?", "")
                    .replaceFirst("^git@github\\.com:", "")
                    .replace(".git$", "");

            Matcher matcher = GITHUB_REPO_PATTERN.matcher(clean);
            if (matcher.find()) {
                String owner = matcher.group(1);
                String repo = matcher.group(2);
                return owner + "/" + repo;
            }
        } catch (Exception ignored) {}
        return null;
    }
}