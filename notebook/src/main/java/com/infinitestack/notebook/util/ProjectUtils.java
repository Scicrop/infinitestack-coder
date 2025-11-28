package com.infinitestack.notebook.util;

import lombok.experimental.UtilityClass;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@UtilityClass
public class ProjectUtils {

    /**
     * Valida se o nome do projeto já está no formato EXATO de um repositório Git/GitHub.
     * NÃO faz sanitização automática.
     * Se inválido → lança ResponseStatusException 400 com mensagem clara.
     * Se válido → retorna true.
     */
    public boolean isValidGitRepoName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome do projeto é obrigatório");
        }

        String trimmed = name.trim();

        // Regras rigorosas do GitHub (2025) - o nome deve já estar perfeito
        if (!trimmed.matches("^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,98}[a-zA-Z0-9])?$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nome inválido. Use apenas letras, números, hífens (-), underscores (_) e pontos (.)\n" +
                            "• Não pode começar ou terminar com hífen ou ponto\n" +
                            "• Não pode ter caracteres especiais como espaço, !, @, #, etc\n" +
                            "• Máximo 100 caracteres");
        }

        if (trimmed.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome do projeto deve ter no máximo 100 caracteres");
        }

        return true;
    }
}