// tools.js — versão FINAL corrigida e robusta

// DETECÇÃO AUTOMÁTICA DO BACKEND
const BACKEND_URL = (function () {
    if (location.port === "63342" || location.port === "63343") {
        return "http://localhost:8080";
    }
    return "";
})();

// Funções auxiliares globais (disponíveis em todo o arquivo)
function showAlert(message, type = "danger") {
    const alertDiv = document.getElementById("projectAlert");
    if (!alertDiv) return;

    alertDiv.className = `alert alert-${type} mt-3`;
    alertDiv.textContent = message;
    alertDiv.classList.remove("d-none");
    setTimeout(() => alertDiv.classList.add("d-none"), 6000);
}

async function apiPost(endpoint, data) {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return response;
}

// ========================================
// Tudo dentro de um único DOMContentLoaded
// ========================================
document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("projectNameInput");
    const btn = document.getElementById("createProjectBtn");
    const spinner = document.getElementById("loadingSpinner");

    // === CRIAÇÃO DE PROJETO ===
    async function createProject() {
        const projectName = input.value.trim();
        if (!projectName) {
            showAlert("Digite o nome do projeto!", "warning");
            return;
        }

        btn.disabled = true;
        spinner.classList.remove("d-none");

        try {
            const response = await apiPost("/api/projects/create", { name: projectName });
            const data = await response.json();

            if (response.ok) {
                showAlert(`Projeto "${data.displayName || projectName}" criado com sucesso!`, "success");
                input.value = "";

                // SALVA NO LOCALSTORAGE E MOSTRA O CABEÇALHO
                showCurrentProject(projectName);

                // Opcional: recarrega lista de projetos
                if (typeof loadProjects === "function") loadProjects();
            } else {
                const title = data.ExceptionTitle || "Erro";
                const msg = data.ExceptionMessage || "Falha ao criar projeto";
                showAlert(`${title}: ${msg}`, "danger");
            }
        } catch (err) {
            console.error(err);
            showAlert("Erro de conexão com o backend", "danger");
        } finally {
            btn.disabled = false;
            spinner.classList.add("d-none");
        }
    }

    btn.addEventListener("click", createProject);
    input.addEventListener("keypress", e => e.key === "Enter" && createProject());

    // === CARREGAMENTO DE PROVIDERS E MODELOS ===
    // === CARREGAMENTO DE PROVIDERS E MODELOS (CORRIGIDO E BLINDADO) ===
    async function loadLLMProviders() {
        const providerSelect = document.getElementById("providerSelect");
        const modelSelect = document.getElementById("modelSelect");

        if (!providerSelect || !modelSelect) return;

        try {
            const providersRes = await fetch(`${BACKEND_URL}/api/llm/providers`);
            if (!providersRes.ok) {
                throw new Error(`HTTP ${providersRes.status}`);
            }

            const data = await providersRes.json();

            // GARANTIMOS que sempre temos um array chamado "providers"
            let providers = [];

            if (Array.isArray(data)) {
                providers = data;                           // veio direto como array
            } else if (data && Array.isArray(data.providers)) {
                providers = data.providers;                 // veio dentro de "providers": [...]
            } else {
                throw new Error("Formato inesperado do JSON de providers");
            }

            // Agora sim, providers é 100% um array → forEach funciona!
            providerSelect.innerHTML = '<option value="">Provider...</option>';
            providers.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                providerSelect.appendChild(opt);
            });

            // Evento de mudança de provider
            providerSelect.addEventListener("change", async () => {
                const providerId = providerSelect.value;
                modelSelect.innerHTML = '<option value="">Model...</option>';

                if (!providerId) return;

                try {
                    const modelsRes = await fetch(`${BACKEND_URL}/api/llm/models/${providerId}`);
                    if (!modelsRes.ok) throw new Error("Erro ao carregar modelos");

                    const models = await modelsRes.json(); // já vem como array direto

                    models.forEach(model => {
                        const opt = document.createElement("option");
                        opt.value = model;
                        opt.textContent = model;
                        modelSelect.appendChild(opt);
                    });

                    // Seleciona o modelo padrão
                    const selectedProvider = providers.find(p => p.id === providerId);
                    if (selectedProvider?.defaultModel) {
                        modelSelect.value = selectedProvider.defaultModel;
                    }
                } catch (err) {
                    showAlert("Erro ao carregar modelos do provider selecionado", "danger");
                }
            });

        } catch (err) {
            console.error("Erro carregando providers:", err);
            showAlert("Falha ao carregar lista de providers. Verifique o backend.", "danger");
        }
    }

    // Executa o carregamento dos providers
    loadLLMProviders();
});

// === IMPORTAÇÃO DE README DO GITHUB ===
let currentReadmeContent = ""; // ← VARIÁVEL GLOBAL NO BROWSER (como você pediu)

const githubTokenInput = document.getElementById("githubTokenInput");
const githubRepoInput = document.getElementById("githubRepositoryInput");
const loadReadmeBtn = document.getElementById("button-load-readme");
const githubSpinner = document.getElementById("githubSpinner");
const githubStatus = document.getElementById("githubStatus");

async function loadGitHubReadme() {
    const token = githubTokenInput.value.trim();
    const repoUrl = githubRepoInput.value.trim();

    if (!token) {
        showAlert("Digite seu GitHub Token!", "warning");
        githubTokenInput.focus();
        return;
    }
    if (!repoUrl) {
        showAlert("Digite a URL do repositório!", "warning");
        githubRepoInput.focus();
        return;
    }

    // Mostra loading
    loadReadmeBtn.disabled = true;
    githubSpinner.classList.remove("d-none");
    githubStatus.innerHTML = "";

    try {
        const url = `${BACKEND_URL}/api/github/readme?token=${encodeURIComponent(token)}&repo=${encodeURIComponent(repoUrl)}`;
        const response = await fetch(url);

        if (response.ok) {
            const markdown = await response.text();
            currentReadmeContent = markdown; // ← SALVO NA VARIÁVEL GLOBAL!

            // Mensagem verde linda
            githubStatus.innerHTML = `
                    <div class="alert alert-success alert-dismissible fade show" role="alert">
                        <strong>Readme.md loaded!</strong> Pronto para usar no editor.
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>`;

            console.log("README carregado (primeiras linhas):");
            console.log(markdown.substring(0, 500) + "...");

            // OPCIONAL: jogar direto num textarea/editor
            // const editor = document.getElementById("readmeEditor");
            // if (editor) editor.value = markdown;

            // Se quiser disparar um evento customizado pra outros componentes reagirem:
            document.dispatchEvent(new CustomEvent("readmeLoaded", { detail: markdown }));

        } else {
            const error = await response.json();
            const title = error.ExceptionTitle || "Erro";
            const msg = error.ExceptionMessage || "Falha ao carregar README";
            showAlert(`${title}: ${msg}`, "danger");
        }
    } catch (err) {
        console.error(err);
        showAlert("Erro de conexão com o backend ou GitHub", "danger");
    } finally {
        loadReadmeBtn.disabled = false;
        githubSpinner.classList.add("d-none");
    }
}

// Eventos
loadReadmeBtn.addEventListener("click", loadGitHubReadme);
githubRepoInput.addEventListener("keypress", e => {
    if (e.key === "Enter") loadGitHubReadme();
});

// === CARREGA DATA SOURCES NO SELECT ===
async function loadDataSources() {
    const dsSelect = document.getElementById("datasourceSelect");
    if (!dsSelect) return;

    try {
        const res = await fetch(`${BACKEND_URL}/api/db/datasources`);
        if (!res.ok) throw new Error("HTTP " + res.status);

        const datasources = await res.json();

        // Limpa e coloca a opção padrão
        dsSelect.innerHTML = '<option selected>Data source...</option>';

        datasources.forEach(ds => {
            const opt = document.createElement("option");
            opt.value = ds.id;           // ← value = id
            opt.textContent = ds.name;   // ← texto visível = name
            dsSelect.appendChild(opt);
        });

        showAlert("Data sources carregados com sucesso!", "success");

    } catch (err) {
        console.error("Erro carregando datasources:", err);
        showAlert("Falha ao carregar bancos de dados. Verifique o JSON em /opt/infinitestack-notebook/dist/", "danger");
    }
}

// Executa ao carregar a página
loadDataSources();

// === DATA SOURCES + SCHEMAS (PostgreSQL) ===
const datasourceSelect = document.getElementById("datasourceSelect");
const schemaSelect = document.getElementById("schemaSelect");
const tableSelect = document.getElementById("tableSelect");

// Armazena o datasource completo selecionado
let currentDataSource = null;

async function loadSchemas(datasourceId) {
    schemaSelect.innerHTML = '<option>Carregando schemas...</option>';
    schemaSelect.disabled = true;
    tableSelect.innerHTML = '<option selected>Table...</option>';
    tableSelect.disabled = true;

    try {
        const res = await fetch(`${BACKEND_URL}/api/db/schemas/${datasourceId}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.ExceptionMessage || "Erro ao carregar schemas");
        }

        const schemas = await res.json();

        schemaSelect.innerHTML = '<option selected>Schema...</option>';
        schemas.forEach(schema => {
            const opt = document.createElement("option");
            opt.value = schema;
            opt.textContent = schema;
            schemaSelect.appendChild(opt);
        });

        schemaSelect.disabled = false;
        showAlert(`Schemas carregados! (${schemas.length} encontrados)`, "success");

    } catch (err) {
        schemaSelect.innerHTML = '<option>Erro ao carregar</option>';
        showAlert("Falha ao carregar schemas: " + err.message, "danger");
    }
}

// Quando mudar o DataSource
datasourceSelect.addEventListener("change", async () => {
    const dsId = datasourceSelect.value;
    schemaSelect.innerHTML = '<option>Schema...</option>';
    tableSelect.innerHTML = '<option selected>Table...</option>';
    schemaSelect.disabled = true;
    tableSelect.disabled = true;

    if (!dsId) {
        currentDataSource = null;
        return;
    }

    // Busca os detalhes do datasource selecionado
    try {
        const res = await fetch(`${BACKEND_URL}/api/db/datasources`);
        const list = await res.json();
        currentDataSource = list.find(ds => ds.id === dsId);

        if (currentDataSource && currentDataSource.type === "postgresql") {
            await loadSchemas(dsId);
        } else {
            schemaSelect.innerHTML = '<option>Somente PostgreSQL suportado</option>';
            showAlert("Este DataSource não é PostgreSQL. Schemas não disponíveis.", "info");
        }
    } catch (err) {
        showAlert("Erro ao carregar detalhes do DataSource", "danger");
    }
});

// === LISTAR TABELAS DO SCHEMA SELECIONADO ===
async function loadTables(datasourceId, schema) {
    tableSelect.innerHTML = '<option>Carregando tabelas...</option>';
    tableSelect.disabled = true;

    try {
        const res = await fetch(
            `${BACKEND_URL}/api/db/schemas/${datasourceId}/tables?schema=${encodeURIComponent(schema)}`
        );

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.ExceptionMessage || "Erro ao carregar tabelas");
        }

        const tables = await res.json();

        tableSelect.innerHTML = '<option selected>Table...</option>';
        tables.forEach(table => {
            const opt = document.createElement("option");
            opt.value = table;
            opt.textContent = table;
            tableSelect.appendChild(opt);
        });

        tableSelect.disabled = false;
        showAlert(`Tabelas carregadas! (${tables.length} encontradas)`, "success");

    } catch (err) {
        tableSelect.innerHTML = '<option>Erro ao carregar</option>';
        showAlert("Falha ao carregar tabelas: " + err.message, "danger");
    }
}

// Evento: quando mudar o schema
schemaSelect.addEventListener("change", () => {
    const schema = schemaSelect.value;
    tableSelect.innerHTML = '<option selected>Table...</option>';
    tableSelect.disabled = true;

    if (schema && currentDataSource) {
        loadTables(datasourceSelect.value, schema);
    }
});

// === CARREGA DDL DA TABELA + TOGGLE VISUAL (100% FUNCIONAL) ===
let currentDDL = "";

async function loadTableDDL(datasourceId, schema, tableName) {
    const ddlOutput = document.getElementById("ddlOutput");
    const ddlContainer = document.getElementById("ddlContainer");
    const ddlStatus = document.getElementById("ddlStatus");
    const ddlControls = document.getElementById("ddlControls");

    // Reseta tudo
    ddlOutput.textContent = "Gerando DDL da tabela...";
    ddlContainer.classList.add("d-none");
    ddlStatus.classList.add("d-none");
    if (ddlControls) ddlControls.classList.add("d-none");

    try {
        const url = `${BACKEND_URL}/api/db/schemas/${datasourceId}/tables/${tableName}/ddl?schema=${encodeURIComponent(schema)}`;
        const res = await fetch(url);

        if (res.ok) {
            const ddl = await res.text();
            currentDDL = ddl;
            updateClearDdlButton();
            ddlOutput.textContent = ddl;

            // Status verde
            ddlStatus.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show" role="alert">
                    <strong>Table Structure loaded!</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>`;
            ddlStatus.classList.remove("d-none");

            // Mostra controles
            if (ddlControls) {
                ddlControls.classList.remove("d-none");
                const showText = ddlControls.querySelector(".show-text");
                const hideText = ddlControls.querySelector(".hide-text");
                showText.classList.remove("d-none");
                hideText.classList.add("d-none");
            }

            // Copia pro clipboard
            navigator.clipboard.writeText(ddl);

        } else {
            const err = await res.json();
            ddlOutput.textContent = "Erro ao carregar DDL";
            showAlert(`Erro: ${err.ExceptionMessage || "Falha"}`, "danger");
        }
    } catch (err) {
        console.error(err);
        ddlOutput.textContent = "Erro de conexão";
        showAlert("Falha ao conectar ao banco", "danger");
    }
}

// === EVENTO DE TABELA + TOGGLE (DENTRO DO DOMContentLoaded) ===
tableSelect.addEventListener("change", () => {
    const table = tableSelect.value;
    if (table && currentDataSource && schemaSelect.value) {
        loadTableDDL(datasourceSelect.value, schemaSelect.value, table);
    }
});

// === TOGGLE DO DDL (DENTRO DO DOMContentLoaded) ===
document.addEventListener("click", function (e) {
    if (e.target.closest("#toggleDDLBtn")) {
        const container = document.getElementById("ddlContainer");
        const btn = e.target.closest("#toggleDDLBtn");
        const showText = btn.querySelector(".show-text");
        const hideText = btn.querySelector(".hide-text");

        container.classList.toggle("d-none");
        showText.classList.toggle("d-none");
        hideText.classList.toggle("d-none");
    }
});

// === VIBE! → CHAMA OPENAI E JOGA NO EDITOR ACE ===
const vibePrompt = document.getElementById("vibe-prompt");
const vibeButton = document.getElementById("button-vibe");
const vibeSpinner = document.getElementById("vibeSpinner");
const vibeText = document.getElementById("vibeText");

async function callOpenAI() {
    const prompt = vibePrompt.value.trim();
    if (!prompt) {
        showAlert("Digite um prompt para o Vibe!", "warning");
        return;
    }

    const provider = document.getElementById("providerSelect")?.value;
    const model = document.getElementById("modelSelect")?.value;
    const apiKey = document.getElementById("openAiKeyInput")?.value?.trim();

    if (!provider || !model || !apiKey) {
        showAlert("Configure Provider, Model e API Key primeiro!", "danger");
        return;
    }

    // Loading
    vibeButton.disabled = true;
    vibeSpinner.classList.remove("d-none");
    vibeText.textContent = "Vibing...";

    const resultContainer = document.getElementById("vibeResultContainer");
    const resultDiv = document.getElementById("vibeResult");
    resultContainer.classList.add("d-none");
    resultDiv.innerHTML = "<em>Processando resposta estruturada...</em>";

    try {
        const currentProject = JSON.parse(localStorage.getItem("infinitestack_current_project") || "null");

        const payload = {
            provider: "openai",
            model: model,
            apiKey: apiKey,
            messages: [{ role: "user", content: prompt }],
            readmeContent: currentReadmeContent || "",
            tableDDL: currentDDL.trim() !== "" ? currentDDL : null,
            language: document.getElementById("langSelect")?.value || "",
            projectName: currentProject
        };

        const response = await fetch(`${BACKEND_URL}/api/llm/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) throw new Error("Erro na API");

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "{}";

        // Parseia o JSON forçado
        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch (e) {
            resultDiv.innerHTML = `<pre class="text-danger">JSON inválido retornado:\n${rawContent}</pre>`;
            resultContainer.classList.remove("d-none");
            throw e;
        }

        // Renderiza bonito
        let html = "";

        (parsed.answers || []).forEach(answer => {
            // Texto em Markdown
            if (answer.markdow_answer && answer.markdow_answer.length > 0) {
                html += '<div class="mb-4">';
                answer.markdow_answer.forEach(line => {
                    html += `<p class="mb-2">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
                });
                html += '</div>';
            }

            // Códigos
            if (answer.code_answer && answer.code_answer.length > 0) {
                answer.code_answer.forEach(block => {
                    const lang = block.type_lang || "text";
                    const code = block.code || "";
                    const langDisplay = lang.toUpperCase();

                    html += `
                    <div class="mb-4">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-primary fs-6">${langDisplay}</span>
                            <button class="btn btn-sm btn-outline-secondary copy-code" data-code="${btoa(unescape(encodeURIComponent(code)))}">
                                Copiar
                            </button>
                            <button class="btn btn-outline-success send-to-editor" title="Enviar para o Editor Ace">
                                Send
                            </button>
                        </div>
                        <pre class="bg-dark text-light p-3 rounded" style="white-space: pre-wrap;"><code>${escapeHtml(code)}</code></pre>
                    </div>`;
                });
            }
        });

        if (!html) html = "<em>Nenhum conteúdo retornado.</em>";
        resultDiv.innerHTML = html;
        resultContainer.classList.remove("d-none");

        // Botões de copiar
        document.querySelectorAll(".copy-code").forEach(btn => {
            btn.addEventListener("click", function () {
                const code = decodeURIComponent(escape(atob(this.dataset.code)));
                navigator.clipboard.writeText(code);
                this.textContent = "Copiado!";
                setTimeout(() => this.textContent = "Copiar", 2000);
            });
        });

        showAlert("Vibe estruturado concluído!", "success");

    } catch (err) {
        if (err.name === "TimeoutError") {
            showAlert("Timeout de 120s atingido.", "danger");
        } else {
            showAlert("Erro no Vibe: " + err.message, "danger");
        }
    } finally {
        vibeButton.disabled = false;
        vibeSpinner.classList.add("d-none");
        vibeText.textContent = "Vibe!";
    }
}



vibeButton.addEventListener("click", callOpenAI);

// Permite Enter + Ctrl para enviar
vibePrompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        callOpenAI();
    }
});


// === SEND TO EDITOR + RUN SQL ===
// === MODO HÍBRIDO: ACE vs JUPYTER (o coração do InfiniteStack) ===
document.addEventListener("click", function (e) {
    const sendBtn = e.target.closest(".send-to-editor");
    if (!sendBtn) return;

    const codeBlock = sendBtn.closest(".mb-4");
    const code = codeBlock.querySelector("pre code").textContent.trim();
    const langBadge = codeBlock.querySelector(".badge");
    const lang = langBadge ? langBadge.textContent.trim().toLowerCase() : "text";

    // Normaliza linguagem
    const normalizedLang = lang.includes("python") ? "python" :
        lang.includes("sql") ? "sql" : "other";

    if (normalizedLang === "python" || normalizedLang === "sql") {
        // MODO JUPYTER NOTEBOOK!
        document.getElementById("aceMode").classList.add("d-none");
        document.getElementById("jupyterMode").classList.remove("d-none");

        createCell(code, normalizedLang);
        showAlert(`Modo Notebook ativado para ${lang.toUpperCase()}!`, "success");

    } else {
        // MODO ACE TRADICIONAL
        document.getElementById("jupyterMode").classList.add("d-none");
        document.getElementById("aceMode").classList.remove("d-none");

        editor.setValue(code);
        editor.gotoLine(1);
        editor.focus();

        // Atualiza modo do Ace
        const aceModes = {
            java: "java",
            javascript: "javascript",
            js: "javascript",
            json: "json",
            html: "html",
            css: "css",
            xml: "xml"
        };
        const mode = aceModes[lang] || "text";
        editor.session.setMode("ace/mode/" + mode);

        // Ativa botão Run
        showRunButton(code, lang);
        showAlert(`Código ${lang.toUpperCase()} enviado para o Ace!`, "success");
    }
});

// === BOTÃO RUN ABAIXO DO EDITOR (só aparece após Send) ===
const runCodeContainer = document.getElementById("runCodeContainer");
const runCodeBtn = document.getElementById("runCodeBtn");
const runResult = document.getElementById("runResult");
const detectedLangSpan = document.getElementById("detectedLang");

let lastSentCode = "";
let lastSentLang = "";

// Função para mostrar o botão Run
function showRunButton(code, lang) {
    lastSentCode = code.trim();
    lastSentLang = lang.toLowerCase();

    if (lastSentCode) {
        runCodeContainer.classList.remove("d-none");
        detectedLangSpan.textContent = lang.toUpperCase();
        runResult.classList.add("d-none");
        runResult.innerHTML = `<div class="text-success">> Código carregado. Pronto para executar!</div>`;
    }
}

// Atualiza o botão Send para ativar o Run
document.addEventListener("click", function (e) {
    const sendBtn = e.target.closest(".send-to-editor");
    if (sendBtn) {
        const codeBlock = sendBtn.closest(".mb-4");
        const codeElement = codeBlock.querySelector("pre code");
        const code = codeElement.textContent;
        const langBadge = codeBlock.querySelector(".badge");
        const lang = langBadge ? langBadge.textContent.trim() : "text";

        // Envia pro Ace
        editor.setValue(code);
        editor.gotoLine(1);
        editor.focus();

        // Ativa o botão Run
        showRunButton(code, lang);

        showAlert("Código enviado para o editor! Botão Run ativado.", "success");
    }
});

// === EXECUTA O CÓDIGO DO EDITOR ===
runCodeBtn.addEventListener("click", async () => {
    const code = editor.getValue().trim();
    if (!code) {
        showAlert("Editor vazio!", "warning");
        return;
    }

    runCodeBtn.disabled = true;
    runCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Executando...';

    runResult.classList.remove("d-none");
    runResult.innerHTML += `<div class="text-info">> Executando ${lastSentLang.toUpperCase()}...</div>`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/vibe/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                language: lastSentLang,
                datasourceId: datasourceSelect.value || null,
                schema: schemaSelect.value || null
            })
        });

        const result = await response.json();

        if (response.ok) {
            if (result.type === "query" && result.rows) {
                let table = `<div class="text-success">> ${result.rowCount} linha(s) retornada(s)</div>`;
                table += "<table class='table table-sm table-striped text-light'><thead><tr>";
                result.columns.forEach(col => table += `<th>${col}</th>`);
                table += "</tr></thead><tbody>";
                result.rows.forEach(row => {
                    table += "<tr>";
                    row.forEach(cell => table += `<td>${escapeHtml(String(cell))}</td>`);
                    table += "</tr>";
                });
                table += "</tbody></table>";
                runResult.innerHTML += table;
            } else {
                runResult.innerHTML += `<div class="text-success">> ${result.message || "Executado com sucesso!"}</div>`;
            }
        } else {
            runResult.innerHTML += `<div class="text-danger">Erro: ${result.ExceptionMessage || "Falha na execução"}</div>`;
        }
    } catch (err) {
        runResult.innerHTML += `<div class="text-danger">Erro de conexão: ${err.message}</div>`;
    } finally {
        runCodeBtn.disabled = false;
        runCodeBtn.innerHTML = '<i class="fas fa-rocket me-2"></i> Run Code';
        runResult.scrollTop = runResult.scrollHeight;
    }
});

function createCell(code = "", lang = "python") {
    const cellId = "cell-" + Date.now();
    const langName = lang === "python" ? "Python" : "SQL";

    const cellHtml = `
    <div class="border rounded shadow-sm mb-4 bg-white">
      <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
        <small class="text-muted">Célula • ${langName}</small>
        <button class="btn btn-sm btn-success run-cell-btn" data-cell="${cellId}">
          Run
        </button>
      </div>
      <div class="p-3">
        <textarea class="form-control cell-code" style="min-height: 120px; font-family: 'Fira Code', monospace;">${code}</textarea>
        
        <!-- MUDANÇA AQUI: fundo branco, borda, scroll horizontal -->
        <div class="cell-output mt-3 p-4 bg-white border rounded shadow-sm d-none" style="overflow-x: auto; max-height: 600px;">
          <div class="output-content"></div>
        </div>
      </div>
    </div>`;

    document.getElementById("notebookCells").insertAdjacentHTML("beforeend", cellHtml);
}


// === EXECUÇÃO DAS CÉLULAS DO MODO NOTEBOOK (Python / SQL) ===
document.getElementById("notebookCells").addEventListener("click", async function (e) {
    const runBtn = e.target.closest(".run-cell-btn");
    if (!runBtn) return;

    const cell = runBtn.closest(".border");
    const textarea = cell.querySelector(".cell-code");
    const outputDiv = cell.querySelector(".cell-output");
    const outputContent = outputDiv.querySelector(".output-content");

    const code = textarea.value.trim();
    if (!code) {
        showAlert("Célula vazia!", "warning");
        return;
    }

    // Mostra loading
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    outputDiv.classList.remove("d-none");
    outputContent.innerHTML = `<div class="text-info">Executando ${cell.querySelector("small").textContent.includes("Python") ? "Python" : "SQL"}...</div>`;

    try {
        const lang = cell.querySelector("small").textContent.includes("Python") ? "python" : "sql";

        const response = await fetch(`${BACKEND_URL}/api/vibe/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                language: lang,
                datasourceId: datasourceSelect.value || null,
                schema: schemaSelect.value || null
            })
        });

        const result = await response.json();

        if (response.ok) {
            let html = "";

            if (lang === "sql") {
                if (result.type === "query" || result.type === "update") {
                    // USA A FUNÇÃO GLOBAL FIXA
                    window.showSqlResult(result);
                } else {
                    console.error("Resultado SQL inválido:", result);
                }
            } else {
                html += `<div class="text-success">${result.message || "Executado com sucesso!"}</div>`;
                if (result.console) {
                    html += `<pre class="text-muted small">${escapeHtml(result.console)}</pre>`;
                }
            }

            outputContent.innerHTML = html;
            showAlert(`${lang.toUpperCase()} executado com sucesso!`, "success");

        } else {
            outputContent.innerHTML = `<div class="text-danger">Erro: ${result.ExceptionMessage || "Falha na execução"}</div>`;
            showAlert(`Erro ao executar ${lang}`, "danger");
        }
    } catch (err) {
        outputContent.innerHTML = `<div class="text-danger">Erro de conexão: ${err.message}</div>`;
        showAlert("Falha ao conectar com o backend", "danger");
    } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = "Run";
    }
});

// Botão + Nova Célula
document.getElementById("addCellBtn").addEventListener("click", () => {
    createCell("", "python");
});


// FUNÇÃO PARA ESCAPAR HTML (OBRIGATÓRIA!)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// FECHA O RESULTADO SQL
document.getElementById("closeSqlResult")?.addEventListener("click", () => {
    document.getElementById("sqlResultContainer").classList.add("d-none");
});

// FUNÇÃO GLOBAL PARA MOSTRAR RESULTADO SQL
window.showSqlResult = function showSqlResult(result) {
    const container = document.getElementById("sqlResultContainer");
    const output = document.getElementById("sqlResultOutput");

    if (!container || !output) {
        console.error("sqlResultContainer ou sqlResultOutput não encontrado!");
        return;
    }

    if (result.type === "query" && result.rows && result.rows.length > 0) {
        const tableId = "fixedSqlTable";

        let html = `
            <div class="p-3 bg-light border-bottom">
                <strong class="text-success">${result.rowCount} linha(s) retornada(s)</strong>
            </div>
            <div class="table-responsive">
                <table class="table table-striped table-sm table-hover mb-0" id="${tableId}">
                    <thead class="table-dark">
                        <tr>
                            ${result.columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${result.rows.map(row =>
            `<tr>${row.map(cell =>
                `<td>${cell === null ? '<em class="text-muted">NULL</em>' : escapeHtml(String(cell))}</td>`
            ).join('')}</tr>`
        ).join('')}
                    </tbody>
                </table>
            </div>`;

        output.innerHTML = html;
        container.classList.remove("d-none");

        // Ativa DataTables
        setTimeout(() => {
            const table = document.getElementById(tableId);
            if (table && window.simpleDatatables) {
                if (table._dataTable) table._dataTable.destroy();
                new simpleDatatables.DataTable(table, {
                    searchable: true,
                    perPage: 25,
                    perPageSelect: [10, 25, 50, 100],
                    labels: {
                        placeholder: "Buscar na tabela...",
                        perPage: "{select} linhas",
                        noRows: "Nenhum resultado",
                        info: "Mostrando {start}–{end} de {rows}"
                    }
                });
            }
        }, 50);

    } else {
        output.innerHTML = `<div class="p-4 text-center text-success fs-5">
            ${result.message || "Comando executado com sucesso!"}
        </div>`;
        container.classList.remove("d-none");
    }
};



// FUNÇÃO PARA ATUALIZAR O BOTÃO DE LIMPAR DDL
function updateClearDdlButton() {
    const btn = document.getElementById("clearDdlBtn");
    if (!btn) return;

    if (currentDDL && currentDDL.trim() !== "") {
        btn.classList.remove("d-none");
    } else {
        btn.classList.add("d-none");
    }
}

// LIMPA O DDL E ATUALIZA O BOTÃO
document.getElementById("clearDdlBtn")?.addEventListener("click", () => {
    currentDDL = "";
    updateClearDdlButton();
    showAlert("DDL removido da memória. Vibe! não enviará mais estrutura de tabela.", "warning");
});

// CHAVE DO LOCALSTORAGE
const CURRENT_PROJECT_KEY = "infinitestack_current_project";

// FUNÇÃO PARA CARREGAR PROJETO SALVO DO LOCALSTORAGE
function loadCurrentProject() {
    const saved = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (saved) {
        const project = JSON.parse(saved);
        showCurrentProject(project);
    } else {
        showCreateProjectForm();
    }
}

// MOSTRA O CABEÇALHO COM O PROJETO ATUAL
function showCurrentProject(project) {
    document.getElementById("currentProjectName").textContent = project;
    document.getElementById("currentProjectHeader").classList.remove("d-none");
    document.getElementById("createProjectForm").classList.add("d-none");

    // Salva no localStorage (por garantia)
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project));
    // ATUALIZA O BREADCRUMB
    console.log(project);
    updateProjectBreadcrumb(project);
}

// MOSTRA O FORMULÁRIO DE CRIAR PROJETO
function showCreateProjectForm() {
    document.getElementById("currentProjectHeader").classList.add("d-none");
    document.getElementById("createProjectForm").classList.remove("d-none");
    document.getElementById("projectNameInput").focus();
}

// EVENTO: TROCAR PROJETO
document.getElementById("changeProjectBtn")?.addEventListener("click", () => {
    if (confirm("Tem certeza que quer trocar de projeto? O atual será mantido no histórico.")) {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
        showCreateProjectForm();
        showAlert("Projeto atual liberado. Crie ou carregue outro.", "info");
    }
});


// CARREGA O PROJETO SALVO AO ABRIR A PÁGINA
document.addEventListener("DOMContentLoaded", () => {
    loadCurrentProject();
});

function updateProjectBreadcrumb(project) {
    const projectItem = document.getElementById("breadcrumbProjectName");
    const projectSpan = document.getElementById("currentProjectBreadcrumb");

    if (project) {
        projectSpan.textContent = project;
        projectItem.style.display = "block";
    } else {
        projectItem.style.display = "none";
    }
}