# InfiniteStack Notebook

Um ambiente de desenvolvimento local, integrado e impulsionado por IA que combina:

- Editor de código avançado (Ace Editor)
- Notebook interativo estilo Jupyter (células Python/SQL)
- Assistente de programação baseado em LLM (OpenAI, etc.)
- Conexão direta com bancos PostgreSQL
- Visualização inline de gráficos matplotlib
- Execução de comandos shell (`!pip install`, `!wget`, etc.)

Tudo rodando localmente, sem dependências de nuvem externas.

## Características principais

- LLM estruturado com contexto automático (README.md + DDL de tabelas)
- Modo híbrido:  
  - Python e SQL → células interativas com saída e gráficos inline  
  - Java, JavaScript, JSON, HTML, etc. → editor Ace completo
- Execução real de SQL com resultados em tabela
- Execução de Python no venv local com suporte completo a matplotlib e pip
- Suporte a comandos shell (`!pip install pandas`, `!wget`, etc.)
- Interface 100% offline-first (backend Spring Boot + frontend estático)
- Design responsivo baseado em Bootstrap 5

## Tecnologias

- Backend: Spring Boot (Java 17+)
- Frontend: HTML5 + Bootstrap 5 + Ace Editor
- Python: venv local + matplotlib (Agg backend)
- Banco de dados: PostgreSQL (via JDBC)
- LLM: OpenAI API (ou qualquer provider compatível)

## Como executar

```bash
# 1. Backend
cd backend
./mvnw spring-boot:run

# 2. Frontend (simplesmente abra o HTML ou sirva com qualquer servidor)
# Exemplo com Python:
cd dist
python3 -m http.server 8081
```

Acesse: http://localhost:8081

## Configuração inicial

1. Criar venv Python em `/opt/infinitestack-notebook/venv`
2. Instalar dependências básicas:
   ```bash
   /opt/infinitestack-notebook/venv/bin/pip install matplotlib pandas seaborn yfinance
   ```
3. Configurar `datasource-providers.json` com suas conexões PostgreSQL

## Licença

Copyleft © SciCrop 2025 – até a AGI chegar.

Feito com paixão no Brasil.  
Sem venture capital. Sem hype. Só código que funciona.
