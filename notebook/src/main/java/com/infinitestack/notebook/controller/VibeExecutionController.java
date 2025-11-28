package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitestack.notebook.entity.UserExceptionEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.*;
import java.util.*;

@RestController
@RequestMapping("/api/vibe/execute")
@CrossOrigin(origins = "*")
public class VibeExecutionController {

    private static final String DS_FILE = "/opt/infinitestack-notebook/dist/datasource-providers.json";
    private final ObjectMapper mapper = new ObjectMapper();

    @PostMapping
    public ResponseEntity<?> execute(@RequestBody Map<String, String> payload) {
        String code = payload.get("code");
        String language = payload.get("language") != null ? payload.get("language").toLowerCase().trim() : "";
        String datasourceId = payload.get("datasourceId");
        String schema = payload.get("schema");

        if (code == null || code.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Código vazio", "O campo 'code' é obrigatório."));
        }

        return switch (language) {
            case "sql" -> executeSql(code.trim(), datasourceId, schema);
            case "python" -> executePython(code.trim());
            case "javascript", "js" -> ResponseEntity.ok(Map.of(
                    "status", "planned",
                    "message", "Execução JavaScript/Node.js em breve!"
            ));
            default -> ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("Linguagem não suportada",
                            "Linguagens suportadas: sql (por enquanto). Recebido: " + language));
        };
    }

    private ResponseEntity<?> executeSql(String sql, String datasourceId, String schema) {
        if (datasourceId == null || datasourceId.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(new UserExceptionEntity("DataSource não informado", "Selecione um banco de dados."));
        }

        File file = new File(DS_FILE);
        if (!file.exists()) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Configuração ausente", "datasource-providers.json não encontrado."));
        }

        try {
            JsonNode root = mapper.readTree(file);
            JsonNode dsNode = null;
            for (JsonNode ds : root.get("datasources")) {
                if (ds.get("id").asText().equals(datasourceId)) {
                    dsNode = ds;
                    break;
                }
            }

            if (dsNode == null || !"postgresql".equalsIgnoreCase(dsNode.get("type").asText())) {
                return ResponseEntity.badRequest()
                        .body(new UserExceptionEntity("Banco inválido", "Apenas PostgreSQL é suportado."));
            }

            String url = String.format("jdbc:postgresql://%s:%d/%s",
                    dsNode.get("host").asText(),
                    dsNode.get("port").asInt(5432),
                    dsNode.get("database").asText());

            String username = dsNode.get("username").asText();
            String password = dsNode.get("password").asText();

            try (Connection conn = DriverManager.getConnection(url, username, password)) {
                if (schema != null && !schema.isEmpty()) {
                    conn.setSchema(schema);
                }

                boolean isQuery = sql.toLowerCase().trim().startsWith("select");

                if (isQuery) {
                    try (Statement stmt = conn.createStatement();
                         ResultSet rs = stmt.executeQuery(sql)) {

                        ResultSetMetaData meta = rs.getMetaData();
                        List<String> columns = new ArrayList<>();
                        for (int i = 1; i <= meta.getColumnCount(); i++) {
                            columns.add(meta.getColumnName(i));
                        }

                        List<List<Object>> rows = new ArrayList<>();
                        while (rs.next()) {
                            List<Object> row = new ArrayList<>();
                            for (int i = 1; i <= meta.getColumnCount(); i++) {
                                Object val = rs.getObject(i);
                                row.add(val == null ? "NULL" : val);
                            }
                            rows.add(row);
                        }

                        Map<String, Object> result = new HashMap<>();
                        result.put("type", "query");
                        result.put("columns", columns);
                        result.put("rows", rows);
                        result.put("rowCount", rows.size());

                        return ResponseEntity.ok(result);

                    }
                } else {
                    try (Statement stmt = conn.createStatement()) {
                        int affected = stmt.executeUpdate(sql);
                        Map<String, Object> result = new HashMap<>();
                        result.put("type", "update");
                        result.put("affectedRows", affected);
                        result.put("message", affected + " linha(s) afetada(s).");
                        return ResponseEntity.ok(result);
                    }
                }

            } catch (SQLException e) {
                return ResponseEntity.status(500)
                        .body(new UserExceptionEntity("Erro SQL", e.getMessage()));
            }

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro interno", e.getMessage()));
        }
    }

    @PostMapping("/python")
    private ResponseEntity<?> executePython(String code) {
        try {
            String venvPython = "/opt/infinitestack-notebook/venv/bin/python";
            String venvPip = "/opt/infinitestack-notebook/venv/bin/pip";
            String tempScript = "/tmp/infinite_python_" + UUID.randomUUID() + ".py";

            StringBuilder finalCode = new StringBuilder();
            StringBuilder consoleOutput = new StringBuilder();

            // Processa linha por linha
            for (String line : code.split("\n")) {
                String trimmed = line.trim();

                // COMANDO !pip, !ls, !wget, etc
                if (trimmed.startsWith("!")) {
                    String command = trimmed.substring(1).trim();

                    // Se for pip install, usa o pip do venv
                    if (command.startsWith("pip install") || command.startsWith("pip ")) {
                        command = venvPip + " " + command.substring(3); // remove "pip"
                    }

                    ProcessBuilder pb = new ProcessBuilder("/bin/bash", "-c", command);
                    pb.redirectErrorStream(true);
                    Process process = pb.start();

                    String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                    consoleOutput.append("Shell: ").append(command).append("\n");
                    consoleOutput.append(output).append("\n");

                    int exitCode = process.waitFor();
                    if (exitCode != 0) {
                        consoleOutput.append("Erro ao executar comando shell\n");
                    }

                    // Não adiciona a linha ! no código Python
                    continue;
                }

                // Linha normal de Python
                finalCode.append(line).append("\n");
            }

            // Adiciona salvamento automático de gráfico (como você já faz)
            String pythonCode = finalCode.toString();
            if (!pythonCode.contains("plt.savefig") && pythonCode.contains("matplotlib")) {
                pythonCode += """
                
                import matplotlib.pyplot as plt
                plt.tight_layout()
                plt.savefig('/tmp/last_plot.png', dpi=150, bbox_inches='tight')
                plt.close()
                print('GRÁFICO SALVO COM SUCESSO')
                """;
            }

            // Salva e executa
            Files.write(Paths.get(tempScript), pythonCode.getBytes(StandardCharsets.UTF_8));

            ProcessBuilder pb = new ProcessBuilder(venvPython, tempScript);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            String pythonOutput = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            consoleOutput.append(pythonOutput);

            int exitCode = process.waitFor();

            // Lê imagem
            String imageBase64 = null;
            Path plotPath = Paths.get("/tmp/last_plot.png");
            if (Files.exists(plotPath)) {
                byte[] imageBytes = Files.readAllBytes(plotPath);
                imageBase64 = "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes);
                Files.deleteIfExists(plotPath);
            }

            Files.deleteIfExists(Paths.get(tempScript));

            Map<String, Object> result = new HashMap<>();
            result.put("success", exitCode == 0);
            result.put("console", consoleOutput.toString().isEmpty() ? "Executado." : consoleOutput.toString());
            result.put("image", imageBase64);
            result.put("message", exitCode == 0 ? "Python + shell executado!" : "Erro na execução");

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro Python", e.getMessage()));
        }
    }
}