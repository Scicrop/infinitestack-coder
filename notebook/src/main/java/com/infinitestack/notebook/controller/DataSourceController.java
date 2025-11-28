package com.infinitestack.notebook.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitestack.notebook.entity.UserExceptionEntity;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.io.IOException;
import java.sql.*;
import java.util.*;

@RestController
@RequestMapping("/api/db")
@CrossOrigin(origins = "*")
public class DataSourceController {

    private static final String DS_FILE = "/opt/infinitestack-notebook/dist/datasource-providers.json";
    private final ObjectMapper mapper = new ObjectMapper();

    @GetMapping("/datasources")
    public ResponseEntity<?> getDataSources() {
        File file = new File(DS_FILE);

        if (!file.exists()) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Arquivo não encontrado",
                            "datasource-providers.json não está em /opt/infinitestack-notebook/dist/"));
        }

        try {
            JsonNode root = mapper.readTree(file);
            JsonNode array = root.get("datasources");



            List<Map<String, Object>> list = mapper.convertValue(array,
                    mapper.getTypeFactory().constructCollectionType(List.class, Map.class));

            return ResponseEntity.ok(list); // retorna TUDO: id, name, type, host, etc

        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Erro de leitura", "Falha ao ler datasource-providers.json: " + e.getMessage()));
        }
    }

    @GetMapping("/schemas/{datasourceId}")
    public ResponseEntity<?> getSchemas(@PathVariable String datasourceId) {
        File file = new File("/opt/infinitestack-notebook/dist/datasource-providers.json");
        if (!file.exists()) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Configuração não encontrada", "datasource-providers.json ausente."));
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

            if (dsNode == null) {
                return ResponseEntity.badRequest()
                        .body(new UserExceptionEntity("DataSource não encontrado", "ID: " + datasourceId));
            }

            String type = dsNode.has("type") ? dsNode.get("type").asText() : "";
            if (!"postgresql".equalsIgnoreCase(type)) {
                return ResponseEntity.ok(List.of()); // retorna vazio se não for PostgreSQL
            }

            String url = String.format("jdbc:postgresql://%s:%d/%s",
                    dsNode.get("host").asText(),
                    dsNode.get("port").asInt(5432),
                    dsNode.get("database").asText());

            String username = dsNode.get("username").asText();
            String password = dsNode.get("password").asText();

            // Conexão JDBC pura (sem Spring Data)
            try (var conn = DriverManager.getConnection(url, username, password)) {
                var sql = "SELECT schema_name FROM information_schema.schemata " +
                        "WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') " +
                        "ORDER BY schema_name";

                try (var stmt = conn.createStatement();
                     var rs = stmt.executeQuery(sql)) {

                    List<String> schemas = new ArrayList<>();
                    while (rs.next()) {
                        schemas.add(rs.getString(1));
                    }
                    return ResponseEntity.ok(schemas);
                }
            }

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro de conexão", "Não foi possível conectar ao PostgreSQL: " + e.getMessage()));
        }
    }

    @GetMapping("/schemas/{datasourceId}/tables")
    public ResponseEntity<?> getTables(
            @PathVariable String datasourceId,
            @RequestParam String schema) {

        File file = new File("/opt/infinitestack-notebook/dist/datasource-providers.json");
        if (!file.exists()) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Configuração não encontrada", "datasource-providers.json ausente."));
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
                return ResponseEntity.ok(List.of());
            }

            String url = String.format("jdbc:postgresql://%s:%d/%s",
                    dsNode.get("host").asText(),
                    dsNode.get("port").asInt(),
                    dsNode.get("database").asText());

            String username = dsNode.get("username").asText();
            String password = dsNode.get("password").asText();

            try (var conn = DriverManager.getConnection(url, username, password)) {
                String sql = """
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ? 
                ORDER BY tablename
                """;

                try (var ps = conn.prepareStatement(sql)) {
                    ps.setString(1, schema);
                    try (var rs = ps.executeQuery()) {
                        List<String> tables = new ArrayList<>();
                        while (rs.next()) {
                            tables.add(rs.getString(1));
                        }
                        return ResponseEntity.ok(tables);
                    }
                }
            }

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro de conexão", "Falha ao listar tabelas: " + e.getMessage()));
        }
    }

    // Adicione no DataSourceController.java

    @GetMapping("/schemas/{datasourceId}/tables/{tableName}/ddl")
    public ResponseEntity<?> getTableDDL(
            @PathVariable String datasourceId,
            @RequestParam String schema,
            @PathVariable String tableName) {

        File file = new File("/opt/infinitestack-notebook/dist/datasource-providers.json");
        if (!file.exists()) {
            return ResponseEntity.internalServerError()
                    .body(new UserExceptionEntity("Config não encontrada", "datasource-providers.json ausente."));
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
                        .body(new UserExceptionEntity("Inválido", "DataSource não é PostgreSQL."));
            }

            String url = String.format("jdbc:postgresql://%s:%d/%s",
                    dsNode.get("host").asText(),
                    dsNode.get("port").asInt(),
                    dsNode.get("database").asText());

            String username = dsNode.get("username").asText();
            String password = dsNode.get("password").asText();

            try (var conn = DriverManager.getConnection(url, username, password)) {
                // Usa pg_get_constraintdef + colunas + índices + constraints
                String ddl = generatePostgreSQLDDL(conn, schema, tableName);
                return ResponseEntity.ok()
                        .contentType(MediaType.TEXT_PLAIN)
                        .body(ddl);

            } catch (SQLException e) {
                e.printStackTrace();
                return ResponseEntity.status(500)
                        .body(new UserExceptionEntity("Erro SQL", "Falha ao gerar DDL: " + e.getMessage()));
            }

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(new UserExceptionEntity("Erro interno", e.getMessage()));
        }
    }

    // Função que gera o DDL bonito
    private String generatePostgreSQLDDL(Connection conn, String schema, String tableName) throws SQLException {
        StringBuilder ddl = new StringBuilder();
        DatabaseMetaData meta = conn.getMetaData();

        String fullTableName = schema + "." + tableName;

        ddl.append("-- DDL para tabela: ").append(fullTableName).append("\n\n");

        // === COLUNAS + TIPOS ===
        try (ResultSet columns = meta.getColumns(null, schema, tableName, null)) {
            ddl.append("CREATE TABLE ").append(fullTableName).append(" (\n");

            List<String> columnLines = new ArrayList<>();
            List<String> pkColumns = new ArrayList<>();

            while (columns.next()) {
                String colName = columns.getString("COLUMN_NAME");
                String typeName = columns.getString("TYPE_NAME");
                int size = columns.getInt("COLUMN_SIZE");
                int nullable = columns.getInt("NULLABLE");
                String defaultVal = columns.getString("COLUMN_DEF");

                StringBuilder line = new StringBuilder("  ").append(colName).append(" ").append(typeName);

                // Tamanho para tipos que aceitam (ex: varchar(255))
                if (size > 0 && !typeName.toLowerCase().contains("text") && !typeName.contains("[]")) {
                    line.append("(").append(size).append(")");
                }

                // Detecta SERIAL / BIGSERIAL corretamente
                if (defaultVal != null && defaultVal.contains("nextval")) {
                    if ("int4".equalsIgnoreCase(typeName) || "integer".equalsIgnoreCase(typeName)) {
                        line = new StringBuilder("  ").append(colName).append(" SERIAL");
                    } else if ("int8".equalsIgnoreCase(typeName) || "bigint".equalsIgnoreCase(typeName)) {
                        line = new StringBuilder("  ").append(colName).append(" BIGSERIAL");
                    }
                }

                // DEFAULT (se não for SERIAL)
                else if (defaultVal != null && !defaultVal.isEmpty()) {
                    line.append(" DEFAULT ").append(defaultVal);
                }

                // NOT NULL
                if (nullable == DatabaseMetaData.columnNoNulls) {
                    line.append(" NOT NULL");
                }

                columnLines.add(line.toString());

            }

            // Escreve colunas
            ddl.append(String.join(",\n", columnLines));
            if (!columnLines.isEmpty()) ddl.append("\n");

            // === PRIMARY KEY ===
            try (ResultSet pk = meta.getPrimaryKeys(null, schema, tableName)) {
                if (pk.next()) {
                    List<String> pkList = new ArrayList<>();
                    String pkName = pk.getString("PK_NAME"); // ← Lê aqui!

                    do {
                        pkList.add(pk.getString("COLUMN_NAME"));
                    } while (pk.next());

                    if (pkName == null || pkName.isBlank()) {
                        pkName = "pk_" + tableName; // fallback seguro
                    }

                    ddl.append("  CONSTRAINT ").append(pkName)
                            .append(" PRIMARY KEY (")
                            .append(String.join(", ", pkList))
                            .append(")\n");
                }
            }

            ddl.append(");\n\n");

            // === COMENTÁRIO DA TABELA ===
            String tableComment = getTableComment(conn, schema, tableName);
            if (tableComment != null && !tableComment.isBlank()) {
                ddl.append("COMMENT ON TABLE ").append(fullTableName)
                        .append(" IS E'").append(tableComment.replace("'", "''")).append("';\n\n");
            }

            // === COMENTÁRIOS DAS COLUNAS ===
            appendColumnComments(conn, schema, tableName, ddl);
            if (ddl.toString().endsWith("\n\n")) {
                ddl.append("\n");
            }

            // === ÍNDICES (exceto PK) ===
            try (ResultSet indexes = meta.getIndexInfo(null, schema, tableName, false, true)) {
                Map<String, StringBuilder> indexMap = new LinkedHashMap<>();
                while (indexes.next()) {
                    String indexName = indexes.getString("INDEX_NAME");
                    if (indexName == null || indexName.endsWith("_pkey")) continue;

                    String col = indexes.getString("COLUMN_NAME");
                    if (col != null) {
                        indexMap.computeIfAbsent(indexName, k -> new StringBuilder())
                                .append(col).append(", ");
                    }
                }
                for (var entry : indexMap.entrySet()) {
                    String cols = entry.getValue().toString().replaceAll(", $", "");
                    ddl.append("CREATE INDEX ").append(entry.getKey())
                            .append(" ON ").append(fullTableName)
                            .append(" (").append(cols).append(");\n");
                }
            }

            return ddl.toString();
        }
    }

    // Helpers
    // === COMENTÁRIO DA TABELA (100% seguro) ===
    private String getTableComment(Connection conn, String schema, String tableName) throws SQLException {
        String sql = """
        SELECT pg_catalog.obj_description(c.oid, 'pg_class') AS description
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = ? 
          AND n.nspname = ?
        """;

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, tableName);
            ps.setString(2, schema);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString("description") : null;
            }
        }
    }

    // === COMENTÁRIOS DAS COLUNAS (100% seguro) ===
    private void appendColumnComments(Connection conn, String schema, String tableName, StringBuilder ddl) throws SQLException {
        String sql = """
        SELECT 
            a.attname AS column_name,
            pg_catalog.col_description(c.oid, a.attnum) AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relname = ?
          AND n.nspname = ?
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
        """;

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, tableName);
            ps.setString(2, schema);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String comment = rs.getString("comment");
                    if (comment != null && !comment.isBlank()) {
                        String colName = rs.getString("column_name");
                        ddl.append("COMMENT ON COLUMN ")
                                .append(schema).append(".").append(tableName)
                                .append(".").append(colName)
                                .append(" IS E'")
                                .append(comment.replace("'", "''"))
                                .append("';\n");
                    }
                }
            }
        }
    }

    private String escapeQuotes(String s) {
        return s == null ? "" : s.replace("'", "''");
    }
}