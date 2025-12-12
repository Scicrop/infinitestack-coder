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

    // inicializa o modal bootstrap
    const modalElement = document.getElementById('logModal');
    if (!modalElement) {
        console.error('Elemento #logModal não encontrado.');
        return;
    }
    logModal = new bootstrap.Modal(modalElement);

    // tenta conectar WebSocket (se falhar, pelo menos o botão continua funcionando)
    connectWebSocket();

    // botão de rodar processo
    const runBtnTranscribe = document.getElementById('button-tfiles');
    if (!runBtnTranscribe) {
        console.error('Botão #button-tfiles não encontrado no DOM.');
        return;
    }

    runBtnTranscribe.addEventListener('click', function () {
        // limpa logs anteriores
        const logOutput = document.getElementById('logOutput');
        if (logOutput) {
            logOutput.textContent = '';
        }

        // abre o modal
        logModal.show();

        const script = 'mp4-txt.py';
        const parameter = document.getElementById("promptFiles").value;

        fetch('http://localhost:8080/api/process/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                script: script,
                parameter: parameter
            })
        })
            .then(resp => resp.text())
            .then(text => {
                console.log('Resposta /api/process/run:', text);
                appendLogLine('[INFO] Processo iniciado para: ' + script);
            })
            .catch(err => {
                console.error('Erro ao iniciar processo:', err);
                appendLogLine('[ERRO AO INICIAR PROCESSO]');
            });
    });


});

let stompClient = null;
let logModal = null;

function connectWebSocket() {
    // Garante que SockJS e Stomp existem
    if (typeof SockJS === 'undefined') {
        console.error('SockJS não está carregado. Confira o CDN.');
        appendLogLine('[ERRO] SockJS não carregado.');
        return;
    }
    if (typeof Stomp === 'undefined') {
        console.error('Stomp não está carregado. Confira o CDN.');
        appendLogLine('[ERRO] STOMP não carregado.');
        return;
    }

    try {
        const socket = new SockJS('http://localhost:8080/ws');   // endpoint configurado no WebSocketConfig
        stompClient = Stomp.over(socket);

        // opcional: remove logs de debug do STOMP no console
        stompClient.debug = null;

        stompClient.connect({}, function (frame) {
            console.log('Conectado: ' + frame);

            // inscreve nos logs
            stompClient.subscribe('/topic/python-logs', function (message) {
                const line = message.body;
                appendLogLine(line);
            });
        }, function (error) {
            console.error('Erro na conexão STOMP:', error);
            appendLogLine('[ERRO WEBSOCKET] ' + error);
        });

    } catch (e) {
        console.error('Falha ao inicializar WebSocket:', e);
        appendLogLine('[ERRO] Falha ao inicializar WebSocket.');
    }
}

function appendLogLine(line) {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) {
        console.error('Elemento #logOutput não encontrado.');
        return;
    }
    logOutput.textContent += line + '\n';
    // rolar para o final automaticamente
    logOutput.scrollTop = logOutput.scrollHeight;
}

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

        await loadSchemas(dsId);

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
const histMsg = document.getElementById("histMsgsInput");
async function callOpenAI() {
    const prompt = vibePrompt.value.trim();
    if (!prompt) return showAlert("Digite um prompt para o Vibe!", "warning");

    const provider = document.getElementById("providerSelect")?.value;
    const model = document.getElementById("modelSelect")?.value;
    const apiKey = document.getElementById("openAiKeyInput")?.value?.trim();

    if (!provider || !model || !apiKey) {
        return showAlert("Configure Provider, Model e API Key primeiro!", "danger");
    }

    // Loading
    vibeButton.disabled = true;
    vibeSpinner.classList.remove("d-none");
    vibeText.textContent = "Vibing...";

    const resultContainer = document.getElementById("vibeResultContainer");
    const resultDiv = document.getElementById("vibeResult");
    resultContainer.classList.add("d-none");
    resultDiv.innerHTML = `<em class="text-muted">Enviando contexto completo...</em>`;

    try {
        // === PEGA OS CAMINHOS DO TEXTAREA (SÓ ISSO!) ===
        const filesText = document.getElementById("promptFiles")?.value?.trim() || "";
        const filePaths = filesText
            .split("\n")
            .map(line => line.trim())
            .map(line => line.replace(/^"|"$/g, "").trim()) // remove aspas externas
            .filter(line => line.length > 0);

        const currentProject = JSON.parse(localStorage.getItem("infinitestack_current_project") || "null");

        // === PAYLOAD FINAL — SÓ ENVIA OS CAMINHOS ===
        const payload = {
            provider: "openai",
            model,
            apiKey,
            messages: [{ role: "user", content: prompt }],
            readmeContent: currentReadmeContent || null,
            tableDDL: currentDDL?.trim() || null,
            language: document.getElementById("langSelect")?.value || null,
            projectName: currentProject,
            filePaths: filePaths.length > 0 ? filePaths : null,
            database: datasourceSelect.value,
            schema: schemaSelect.value,
            tableName: tableSelect.value,
            histMsg: histMsg.value
        };

        const response = await fetch(`${BACKEND_URL}/api/llm/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(180000)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.ExceptionMessage || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content?.trim();

        if (!rawContent) throw new Error("Resposta vazia do LLM");

        renderVibeResponse(rawContent, resultDiv, resultContainer);
        showAlert(`Vibe! concluído! (${filePaths.length} arquivo(s) no contexto)`, "success");

    } catch (err) {
        console.error("Erro no Vibe!:", err);
        const msg = err.name === "TimeoutError"
            ? "Tempo esgotado. Tente menos arquivos ou prompt menor."
            : err.message;

        resultDiv.innerHTML = `<pre class="text-danger">Erro: ${escapeHtml(msg)}</pre>`;
        resultContainer.classList.remove("d-none");
        showAlert("Falha no Vibe!: " + msg, "danger");
    } finally {
        vibeButton.disabled = false;
        vibeSpinner.classList.add("d-none");
        vibeText.textContent = "Vibe!";
    }
}

// === FUNÇÃO AUXILIAR: CARREGA ARQUIVOS DO promptFiles ===
async function loadFilesFromPromptFiles() {
    const textarea = document.getElementById("promptFiles");
    const text = textarea?.value?.trim();
    if (!text) return [];

    const paths = text
        .split("\n")
        .map(line => line.trim())
        .map(line => line.replace(/^"|"$/g, "").trim())
        .filter(line => line.length > 0);

    if (paths.length === 0) return [];

    const files = [];
    for (const path of paths) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/vibe/files/read?path=${encodeURIComponent(path)}`);
            const content = res.ok ? await res.text() : `// ERRO 404: Arquivo não encontrado`;
            files.push({ path, content });
        } catch (err) {
            files.push({ path, content: `// ERRO: Não foi possível ler o arquivo` });
        }
    }
    return files;
}

// === FUNÇÃO AUXILIAR: RENDERIZA RESPOSTA DO VIBE! ===
function renderVibeResponse(rawContent, resultDiv, resultContainer) {
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    } catch (e) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <strong>JSON inválido retornado pelo LLM:</strong>
                <pre class="mt-2 bg-dark text-light p-3 rounded">${escapeHtml(rawContent)}</pre>
            </div>`;
        resultContainer.classList.remove("d-none");
        return;
    }

    let html = "";

    (parsed.answers || []).forEach(answer => {
        // Markdown
        if (answer.markdow_answer?.length) {
            html += '<div class="mb-4">';
            answer.markdow_answer.forEach(line => {
                const formatted = line
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code class="bg-secondary text-light px-1 rounded">$1</code>');
                html += `<p class="mb-2">${formatted}</p>`;
            });
            html += '</div>';
        }

        // Código
        if (answer.code_answer?.length) {
            answer.code_answer.forEach(block => {
                const lang = (block.type_lang || "text").toUpperCase();
                const code = block.code || "";

                html += `
                <div class="mb-4 bg-dark rounded overflow-hidden shadow-sm">
                    <div class="d-flex justify-content-between align-items-center bg-secondary px-3 py-2">
                        <span class="badge bg-primary fs-6">${lang}</span>
                        <div>
                            <button class="btn btn-sm btn-outline-light copy-code me-2" 
                                    data-code="${btoa(unescape(encodeURIComponent(code)))}">
                                Copiar
                            </button>
                            <button class="btn btn-sm btn-success send-to-editor">
                                Send → Editor
                            </button>
                        </div>
                    </div>
                    <pre class="m-0 p-3 text-light" style="white-space: pre-wrap; font-size: 0.9rem;">
<code>${escapeHtml(code)}</code>
                    </pre>
                </div>`;
            });
        }
    });

    if (!html) html = "<em class='text-muted'>Nenhum conteúdo estruturado retornado.</em>";
    resultDiv.innerHTML = html;
    resultContainer.classList.remove("d-none");

    // Ativa botões de cópia
    document.querySelectorAll(".copy-code").forEach(btn => {
        btn.addEventListener("click", function () {
            const code = decodeURIComponent(escape(atob(this.dataset.code)));
            navigator.clipboard.writeText(code);
            this.textContent = "Copiado!";
            setTimeout(() => this.textContent = "Copiar", 2000);
        });
    });
}

// === EVENTOS ===
vibeButton.addEventListener("click", callOpenAI);

vibePrompt.addEventListener("keydown", e => {
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
        console.log(lang);
        // Envia pro Ace
        editor.setValue(code);
        editor.gotoLine(1);
        editor.focus();

        // Ativa o botão Run
        showRunButton(code, lang);

        showAlert("Código enviado para o editor! Botão Run ativado.", "success");
    }
});

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

    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    outputDiv.classList.remove("d-none");
    outputContent.innerHTML = `<div class="text-info">Executando...</div>`;

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
            // Usa a mesma função de renderização do Vibe!
            renderVibeResponse(JSON.stringify({ answers: [{ markdow_answer: [], code_answer: [{ type_lang: lang, code: code }] }] }), outputContent, outputDiv);
            // Mas depois substitui pelo resultado real
            if (lang === "sql") {
                window.showSqlResult(result);
            } else if (lang === "python") {
                let html = "";
                if (result.console) {
                    html += `<pre class="text-success small mb-3">${escapeHtml(result.console.trim())}</pre>`;
                }
                if (result.image) {
                    html += `<div class="text-center my-4">
                               <img src="${result.image}" class="img-fluid rounded shadow" style="max-width: 100%;" />
                             </div>`;
                }
                outputContent.innerHTML = html || `<div class="text-success">Executado com sucesso!</div>`;
            }
            showAlert(`${lang.toUpperCase()} executado!`, "success");
        } else {
            outputContent.innerHTML = `<div class="text-danger">Erro: ${result.ExceptionMessage || "Falha"}</div>`;
            showAlert("Erro ao executar", "danger");
        }
    } catch (err) {
        outputContent.innerHTML = `<div class="text-danger">Erro de conexão: ${err.message}</div>`;
        showAlert("Falha ao conectar", "danger");
    } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = "Run";
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


// === RENDERIZA RESPOSTA DO VIBE! (TUDO FUNCIONA AGORA) ===
function renderVibeResponse(rawContent, resultDiv, resultContainer) {
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    } catch (e) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <strong>JSON inválido retornado pelo LLM:</strong>
                <pre class="mt-2 bg-dark text-light p-3 rounded">${escapeHtml(rawContent)}</pre>
            </div>`;
        resultContainer.classList.remove("d-none");
        return;
    }

    let html = "";

    (parsed.answers || []).forEach(answer => {
        // Texto em Markdown
        if (answer.markdow_answer?.length) {
            html += '<div class="mb-4">';
            answer.markdow_answer.forEach(line => {
                const formatted = line
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code class="bg-secondary text-light px-1 rounded">$1</code>');
                html += `<p class="mb-2">${formatted}</p>`;
            });
            html += '</div>';
        }

        // Códigos — TODAS AS LINGUAGENS
        if (answer.code_answer?.length) {
            answer.code_answer.forEach(block => {
                const lang = (block.type_lang || "text").toUpperCase();
                const code = block.code || "";

                // Container geral
                html += `
                <div class="mb-4 bg-dark rounded overflow-hidden shadow-sm">
                    <div class="d-flex justify-content-between align-items-center bg-secondary px-3 py-2">
                        <span class="badge bg-primary fs-6">${lang}</span>
                        <div>
                            <button class="btn btn-sm btn-outline-light copy-code me-2" 
                                    data-code="${btoa(unescape(encodeURIComponent(code)))}">
                                Copiar
                            </button>
                            <button class="btn btn-sm btn-success send-to-editor">
                                Send → Editor
                            </button>
                        </div>
                    </div>
                    <pre class="m-0 p-3 text-light" style="white-space: pre-wrap; font-size: 0.9rem;">
                        <code>${escapeHtml(code)}</code>
                    </pre>
                </div>`;
            });
        }
    });

    if (!html) html = "<em class='text-muted'>Nenhum conteúdo estruturado retornado.</em>";
    resultDiv.innerHTML = html;
    resultContainer.classList.remove("d-none");

    // Ativa botões de cópia
    document.querySelectorAll(".copy-code").forEach(btn => {
        btn.addEventListener("click", function () {
            const code = decodeURIComponent(escape(atob(this.dataset.code)));
            navigator.clipboard.writeText(code);
            this.textContent = "Copiado!";
            setTimeout(() => this.textContent = "Copiar", 2000);
        });
    });
}

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

    updateProjectBreadcrumb(project);
    showDevEnvironment();
}

// MOSTRA O FORMULÁRIO DE CRIAR PROJETO
function showCreateProjectForm() {
    document.getElementById("projectNameInput").value = "";
    showProjectsScreen(); // VOLTA PRA TELA INICIAL
}

// EVENTO: TROCAR PROJETO
document.getElementById("changeProjectBtn")?.addEventListener("click", () => {
    if (confirm("Tem certeza que quer trocar de projeto? O atual será mantido no histórico.")) {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
        showCreateProjectForm();
        updateProjectBreadcrumb(null);


        showAlert("Projeto atual liberado. Crie ou carregue outro.", "info");
        // ESCONDE TODO O CONTEÚDO DO PROJETO
        hideDevEnvironment();
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

async function loadAllProjects() {
    try {
        const response = await fetch( `${BACKEND_URL}/api/projects/list`);
        const projects = await response.json();

        const container = document.getElementById("projectsList");
        const noProjectsMsg = document.getElementById("noProjectsMessage");

        if (!projects || projects.length === 0) {
            noProjectsMsg.classList.remove("d-none");
            container.innerHTML = "";
            return;
        }

        noProjectsMsg.classList.add("d-none");
        container.innerHTML = projects.map(p => `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0 hover-shadow cursor-pointer" 
                     onclick="loadProject('${p.name}')">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title text-primary mb-2">
                            <i class="fas fa-folder me-2"></i>
                            ${escapeHtml(p.displayName)}
                        </h5>
                        <p class="card-text text-muted small mb-2">
                            <strong>${p.fileCount}</strong> arquivos • 
                            <strong>${p.historyCount}</strong> interações
                        </p>
                        <p class="card-text text-muted small mt-auto">
                            Criado em ${formatDate(p.createdAt)}
                        </p>
                    </div>
                    <div class="card-footer bg-transparent border-0">
                        <small class="text-success">
                            <i class="fas fa-arrow-right"></i> Abrir projeto
                        </small>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Erro ao carregar projetos:", err);
        showAlert("Erro ao carregar projetos", "danger");
    }
}

// Função auxiliar para formatar data
function formatDate(isoString) {
    if (!isoString || isoString === "Desconhecido") return "data desconhecida";
    const date = new Date(isoString);
    return date.toLocaleDateString("pt-BR") + " às " + date.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
}


// Função para carregar um projeto ao clicar
async function loadProject(projectName) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/projects/${projectName}`);
        if (!response.ok) throw new Error("Projeto não encontrado");
        const project = await response.json();
        console.log(project);
        showCurrentProject(project.name);
    } catch (err) {
        showAlert("Erro ao carregar projeto: " + err.message, "danger");
    }
}

// ESCONDE O CONTEÚDO PRINCIPAL QUANDO NÃO TEM PROJETO
function hideDevEnvironment() {
    document.getElementById("devEnv").classList.add("d-none");
}

function showProjectsScreen() {
    document.getElementById("projectsEnv").classList.remove("d-none");
    document.getElementById("devEnv").classList.add("d-none");
    loadAllProjects(); // CARREGA A LISTA
}

function showDevEnvironment() {
    document.getElementById("projectsEnv").classList.add("d-none");
    document.getElementById("devEnv").classList.remove("d-none");
}

// Link "Projects" no breadcrumb volta pra tela inicial
document.getElementById("backToProjects")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Sair do projeto atual projeto?")) {
        localStorage.removeItem("infinitestack_current_project");
        showProjectsScreen();
        showAlert("Projeto fechado. Bem-vindo de volta!", "info");
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("infinitestack_current_project");
    if (saved) {
        const project = JSON.parse(saved);
        showCurrentProject(project);
    } else {
        showProjectsScreen(); // tela inicial limpa
    }
});

document.getElementById("button-files")?.addEventListener("click", async () => {
    const rootInput = document.getElementById("rootFolder");
    const textarea = document.getElementById("promptFiles");
    const btnText = document.getElementById("promptFilesText");

    const root = rootInput.value.trim();
    if (!root) {
        showAlert("Digite o caminho da pasta!", "warning");
        return;
    }

    btnText.textContent = "Carregando...";

    try {
        const res = await fetch(`${BACKEND_URL}/api/projects/files/list?root=${encodeURIComponent(root)}`);
        const files = await res.json();

        if (!res.ok) {
            throw new Error(files.ExceptionMessage || "Erro ao carregar");
        }

        if (files.length === 0) {
            showAlert("Nenhum arquivo de texto encontrado nessa pasta.", "info");
            return;
        }

        // APPEND — NÃO SUBSTITUI!
        const current = textarea.value.trim();
        const newLines = files.join("\n");
        textarea.value = current ? current + "\n" + newLines : newLines;

        showAlert(`${files.length} arquivo(s) adicionado(s) ao contexto!`, "success");


    } catch (err) {
        showAlert("Erro: " + err.message, "danger");
    } finally {
        btnText.textContent = "Append files";
    }
});