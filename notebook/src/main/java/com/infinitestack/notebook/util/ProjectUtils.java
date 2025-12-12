package com.infinitestack.notebook.util;

import lombok.experimental.UtilityClass;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

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

    /**
     * Calcula o MD5 de um arquivo de forma compatível com o comando md5sum do Linux.
     *
     * @param file Caminho do arquivo
     * @return String com o hash MD5 em hexadecimal minúsculo (32 caracteres)
     * @throws IllegalArgumentException se o arquivo não existir ou não for um arquivo regular
     * @throws RuntimeException         se ocorrer erro ao ler o arquivo ou ao calcular o MD5
     */
    public static String md5OfFile(Path file) {
        if (file == null) {
            throw new IllegalArgumentException("O Path não pode ser null");
        }

        if (!Files.exists(file)) {
            throw new IllegalArgumentException("Arquivo não encontrado: " + file.toAbsolutePath());
        }

        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("O caminho não é um arquivo regular: " + file.toAbsolutePath());
        }

        try {
            // Lê todo o conteúdo do arquivo de uma vez (eficiente para a maioria dos casos)
            byte[] data = Files.readAllBytes(file);

            MessageDigest md = MessageDigest.getInstance("MD5");
            md.update(data);
            byte[] digest = md.digest();

            // Converte para hexadecimal (exatamente como md5sum faz)
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b & 0xff));
            }

            return sb.toString();

        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Algoritmo MD5 não disponível na JVM", e);
        } catch (Exception e) {  // IOException ou outras
            throw new RuntimeException("Erro ao ler o arquivo: " + file.toAbsolutePath(), e);
        }
    }

}