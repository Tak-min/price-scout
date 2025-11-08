(() => {
    "use strict";

    const STORAGE_KEY = "priceScout_products";
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const API_BASE_STORAGE_KEY = "priceScout_apiBaseUrl";

    const state = {
        products: [],
        searchQuery: "",
        lastJson: ""
    };

    const elements = {
        receiptInput: document.getElementById("receiptInput"),
        loadingIndicator: document.getElementById("loadingIndicator"),
        rawTextOutput: document.getElementById("rawTextOutput"),
        registerButton: document.getElementById("registerButton"),
        searchInput: document.getElementById("searchInput"),
        productTableBody: document.getElementById("productTableBody"),
        productRowTemplate: document.getElementById("productRowTemplate"),
        exportButton: document.getElementById("exportButton"),
        importInput: document.getElementById("importInput"),
        clearButton: document.getElementById("clearButton")
    };

    function init() {
        attachEventListeners();
        loadProductsFromStorage();
        renderProducts();
    }

    function attachEventListeners() {
        elements.receiptInput.addEventListener("change", handleImageSelection);
        elements.rawTextOutput.addEventListener("input", handleRawTextChange);
        elements.registerButton.addEventListener("click", handleRegisterJson);
        elements.searchInput.addEventListener("input", handleSearch);
        elements.exportButton.addEventListener("click", handleExport);
        elements.importInput.addEventListener("change", handleImport);
        elements.clearButton.addEventListener("click", handleClearAll);
    }

    function loadProductsFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                state.products = [];
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                state.products = parsed
                    .map(item => ({
                        id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        name: typeof item.name === "string" ? item.name.trim() : "",
                        price: normalizePrice(item.price),
                        store: typeof item.store === "string" ? item.store.trim() : "",
                        raw: typeof item.raw === "string" ? item.raw : ""
                    }))
                    .filter(product => product.name && product.price !== null);
            }
        } catch (error) {
            console.error("Failed to load products", error);
            state.products = [];
        }
    }

    function persistProducts() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));
    }

    async function handleImageSelection(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        if (!file.type.startsWith("image/")) {
            window.alert("画像ファイルを選択してください。");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            window.alert("5MB以下の画像にしてください。");
            return;
        }
        showLoading(true);
        try {
            const jsonText = await requestGemini(file);
            state.lastJson = jsonText;
            displayRawText(jsonText);
            updateRegisterButtonState();
        } catch (error) {
            console.error(error);
            window.alert(error.message || "解析に失敗しました。時間をおいて再度お試しください。");
        } finally {
            showLoading(false);
        }
    }

    function showLoading(isLoading) {
        elements.loadingIndicator.classList.toggle("hidden", !isLoading);
        elements.registerButton.disabled = isLoading || !elements.rawTextOutput.value.trim();
    }

    function displayRawText(text) {
        elements.rawTextOutput.value = text || "";
    }

    async function requestGemini(file) {
        const formData = new FormData();
        formData.append("receipt", file);
        const response = await fetch('/api/gemini', {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            const payload = await safeReadJson(response);
            if (response.status === 429) {
                throw new Error("Gemini APIの利用上限に達しました。数分お待ちいただいてから再度お試しください。");
            }
            const message = payload?.error || `Gemini API 呼び出しでエラーが発生しました (${response.status})`;
            throw new Error(message);
        }
        const text = await response.text();
        return text;
    }

    async function safeReadJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    function handleRawTextChange() {
        state.lastJson = elements.rawTextOutput.value;
        updateRegisterButtonState();
    }

    function updateRegisterButtonState() {
        const text = elements.rawTextOutput.value.trim();
        if (!text) {
            elements.registerButton.disabled = true;
            return;
        }
        elements.registerButton.disabled = !isValidJsonStructure(text);
    }

    function isValidJsonStructure(text) {
        try {
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object") {
                return false;
            }
            if (!Array.isArray(parsed.items)) {
                return false;
            }
            return parsed.items.every(item => typeof item.name === "string" && typeof item.price !== "undefined");
        } catch (error) {
            return false;
        }
    }

    function handleRegisterJson() {
        const text = elements.rawTextOutput.value.trim();
        if (!isValidJsonStructure(text)) {
            window.alert("JSON形式が正しくありません。store と items 配列を含めてください。");
            return;
        }
        try {
            const parsed = JSON.parse(text);
            const normalized = normalizeReceiptJson(parsed);
            if (normalized.items.length === 0) {
                window.alert("登録できる商品がありません。");
                return;
            }
            normalized.items.forEach(product => {
                state.products.push(product);
            });
            persistProducts();
            renderProducts();
            window.alert(`${normalized.items.length}件のデータを登録しました。`);
            elements.rawTextOutput.value = "";
            state.lastJson = "";
            updateRegisterButtonState();
        } catch (error) {
            console.error(error);
            window.alert("JSONの解析に失敗しました。");
        }
    }

    function normalizeReceiptJson(parsed) {
        const store = typeof parsed.store === "string" ? parsed.store.trim() : "";
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        const registered = items
            .map(item => {
                const name = typeof item.name === "string" ? item.name.trim() : "";
                const price = normalizePrice(item.price);
                if (!name || price === null) {
                    return null;
                }
                return {
                    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    name,
                    price,
                    store,
                    raw: state.lastJson
                };
            })
            .filter(Boolean);
        return { store, items: registered };
    }

    function normalizePrice(value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value >= 0 ? value : null;
        }
        if (typeof value === "string") {
            const cleaned = value.replace(/[^0-9.]/g, "");
            if (!cleaned) {
                return null;
            }
            const parsed = Number.parseFloat(cleaned);
            if (Number.isNaN(parsed) || parsed < 0) {
                return null;
            }
            return parsed;
        }
        return null;
    }

    function handleSearch(event) {
        state.searchQuery = event.target.value.toLowerCase();
        renderProducts();
    }

    function renderProducts() {
        const fragment = document.createDocumentFragment();
        const filtered = getFilteredProducts();
        const sorted = [...filtered].sort((a, b) => a.price - b.price);
        sorted.forEach(product => {
            const row = elements.productRowTemplate.content.cloneNode(true);
            populateRow(row, product);
            fragment.appendChild(row);
        });
        elements.productTableBody.innerHTML = "";
        elements.productTableBody.appendChild(fragment);
        attachRowActions();
    }

    function getFilteredProducts() {
        if (!state.searchQuery) {
            return state.products;
        }
        return state.products.filter(product => {
            const haystack = `${product.name} ${product.store}`.toLowerCase();
            return haystack.includes(state.searchQuery);
        });
    }

    function populateRow(rowFragment, product) {
        const row = rowFragment.querySelector("tr");
        row.dataset.productId = product.id;
        row.querySelector('[data-field="name"]').textContent = product.name;
        row.querySelector('[data-field="price"]').textContent = formatCurrency(product.price);
        row.querySelector('[data-field="store"]').textContent = product.store;
    }

    function formatCurrency(value) {
        const number = Number(value);
        if (Number.isNaN(number)) {
            return "-";
        }
        return `${Math.round(number).toLocaleString()}円`;
    }

    function attachRowActions() {
        elements.productTableBody.querySelectorAll("button[data-action]").forEach(button => {
            button.addEventListener("click", event => {
                const action = event.currentTarget.dataset.action;
                const row = event.currentTarget.closest("tr");
                const productId = row?.dataset.productId;
                if (!productId) {
                    return;
                }
                if (action === "delete") {
                    deleteProduct(productId);
                }
            });
        });
    }

    function deleteProduct(productId) {
        const target = state.products.find(product => product.id === productId);
        if (!target) {
            return;
        }
        const confirmed = window.confirm(`${target.name} を削除しますか？`);
        if (!confirmed) {
            return;
        }
        state.products = state.products.filter(product => product.id !== productId);
        persistProducts();
        renderProducts();
    }

    function handleExport() {
        if (state.products.length === 0) {
            window.alert("エクスポートするデータがありません。");
            return;
        }
    const blob = new Blob([JSON.stringify(state.products, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `price-scout-${dayjs().format("YYYYMMDD-HHmmss")}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function handleImport(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!Array.isArray(parsed)) {
                    throw new Error("JSON形式が不正です。");
                }
                state.products = parsed.map(item => ({
                    id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    name: item.name || "",
                    price: normalizePrice(item.price),
                    store: item.store || "",
                    raw: item.raw || ""
                })).filter(product => product.name && product.price !== null);
                persistProducts();
                renderProducts();
                window.alert("インポートが完了しました。");
            } catch (error) {
                console.error(error);
                window.alert("JSONの読み込みに失敗しました。");
            }
        };
        reader.readAsText(file, "utf-8");
    }

    function handleClearAll() {
        if (state.products.length === 0) {
            return;
        }
        const confirmed = window.confirm("全データを削除しますか？");
        if (!confirmed) {
            return;
        }
        state.products = [];
        persistProducts();
        renderProducts();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
