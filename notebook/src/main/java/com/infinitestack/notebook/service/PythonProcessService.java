package com.infinitestack.notebook.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

@Service
public class PythonProcessService {

    private final SimpMessagingTemplate messagingTemplate;

    // Ajuste os caminhos conforme seu ambiente real
    private static final String PYTHON_BIN = "/opt/infinitestack-notebook/venv/python3";
    // Em muitos venvs seria algo como: "/opt/infinitestack-notebook/venv/bin/python3"
    private static final String SCRIPTS_DIR = "/opt/infinitestack-notebook/scripts/";

    public PythonProcessService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Versão simples, com script e parâmetro padrão.
     * Pode usar, por exemplo, para testes rápidos.
     */
    public void runPythonScriptAsync() {
        // exemplo de defaults
        runPythonScriptAsync("test_script.py", "foo");
    }

    /**
     * Executa um script Python em background, com parâmetro opcional.
     */
    public void runPythonScriptAsync(String script, String parameter) {
        // roda em uma thread separada para não travar o request
        Thread t = new Thread(() -> runPythonScript(script, parameter));
        t.setDaemon(true);
        t.start();
    }

    private void runPythonScript(String script, String parameter) {
        try {
            // Monta o caminho completo do script
            String scriptPath = SCRIPTS_DIR + script;

            ProcessBuilder pb;

            if (parameter != null && !parameter.isBlank()) {
                pb = new ProcessBuilder(
                        PYTHON_BIN,
                        scriptPath,
                        parameter
                );
            } else {
                pb = new ProcessBuilder(
                        PYTHON_BIN,
                        scriptPath
                );
            }

            pb.redirectErrorStream(true); // junta stdout + stderr

            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {

                String line;
                while ((line = reader.readLine()) != null) {
                    // envia cada linha para o tópico WebSocket
                    messagingTemplate.convertAndSend("/topic/python-logs", line);
                }
            }

            int exitCode = process.waitFor();
            messagingTemplate.convertAndSend(
                    "/topic/python-logs",
                    "[PROCESSO FINALIZADO] exitCode = " + exitCode
            );

        } catch (Exception e) {
            messagingTemplate.convertAndSend(
                    "/topic/python-logs",
                    "[ERRO] " + e.getMessage()
            );
            e.printStackTrace();
        }
    }
}
