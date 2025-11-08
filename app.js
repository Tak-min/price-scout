(() => {
    "use strict";

    const STORAGE_KEY = "priceScout_products";
    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    const state = {
        products: [],
        searchQuery: "",
        editingId: null,
        lastRawText: ""
    };

    const elements = {
        receiptInput: document.getElementById("receiptInput"),
        loadingIndicator: document.getElementById("loadingIndicator"),
        rawTextOutput: document.getElementById("rawTextOutput"),
        searchInput: document.getElementById("searchInput"),
        productTableBody: document.getElementById("productTableBody"),
        productRowTemplate: document.getElementById("productRowTemplate"),
        exportButton: document.getElementById("exportButton"),
        importInput: document.getElementById("importInput"),
        clearButton: document.getElementById("clearButton"),
        modal: document.getElementById("productModal"),
        modalForm: document.getElementById("productForm"),
        modalTitle: document.getElementById("modalTitle"),
        closeModalButton: document.getElementById("closeModalButton"),
        modalCancelButton: document.getElementById("modalCancelButton"),
        productName: document.getElementById("productName"),
        productPrice: document.getElementById("productPrice"),
        productQuantity: document.getElementById("productQuantity"),
        productUnit: document.getElementById("productUnit"),
        productStore: document.getElementById("productStore"),
        productDate: document.getElementById("productDate"),
        productMemo: document.getElementById("productMemo")
    };

    function init() {
        attachEventListeners();
        loadProductsFromStorage();
        renderProducts();
    }

    function attachEventListeners() {
        elements.receiptInput.addEventListener("change", handleImageSelection);
        elements.searchInput.addEventListener("input", handleSearch);
        elements.exportButton.addEventListener("click", handleExport);
        elements.importInput.addEventListener("change", handleImport);
        elements.clearButton.addEventListener("click", handleClearAll);
        elements.closeModalButton.addEventListener("click", closeModal);
        elements.modalCancelButton.addEventListener("click", closeModal);
        elements.modal.addEventListener("click", evt => {
            if (evt.target === elements.modal) {
                closeModal();
            }
        });
        elements.modalForm.addEventListener("submit", handleModalSubmit);
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
                state.products = parsed;
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
            const rawText = await runOcr(file);
            state.lastRawText = rawText;
            displayRawText(rawText);
            const geminiData = await requestGemini(rawText);
            openModalWithGeminiData(geminiData);
        } catch (error) {
            console.error(error);
            window.alert(error.message || "解析に失敗しました。時間をおいて再度お試しください。");
        } finally {
            showLoading(false);
        }
    }

    function showLoading(isLoading) {
        elements.loadingIndicator.classList.toggle("hidden", !isLoading);
    }

    function displayRawText(text) {
        elements.rawTextOutput.value = text || "";
    }

    async function runOcr(file) {
        if (!window.Tesseract || typeof window.Tesseract.createWorker !== "function") {
            throw new Error("Tesseract.js が読み込まれていません。");
        }
        const worker = await window.Tesseract.createWorker("jpn");
        try {
            await worker.setParameters({
                tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz円¥:%.-()/\\+*[]{}<>~・, 　アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン店計税品領収合計税込小計本体",
                tessedit_pageseg_mode: window.Tesseract.PSM.AUTO
            });
            const { data } = await worker.recognize(file);
            return (data?.text || "").trim();
        } finally {
            await worker.terminate();
        }
    }

    async function requestGemini(rawText) {
        const response = await fetch("/api/gemini", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ rawText })
        });
        if (!response.ok) {
            const payload = await safeReadJson(response);
            const message = payload?.error || `Gemini API 呼び出しでエラーが発生しました (${response.status})`;
            throw new Error(message);
        }
        const data = await response.json();
        return data;
    }

    async function safeReadJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    function openModalWithGeminiData(geminiData) {
        const initialValues = normalizeGeminiData(geminiData);
        state.editingId = null;
        fillForm(initialValues);
        elements.modalTitle.textContent = "レシート内容の確認";
        elements.modal.classList.remove("hidden");
        window.requestAnimationFrame(() => {
            elements.productName.focus();
        });
    }

    function normalizeGeminiData(data) {
        if (!data || typeof data !== "object") {
            return buildEmptyProduct();
        }
        return {
            id: null,
            name: data.name || "",
            price: data.total ?? data.price ?? "",
            quantity: data.quantity ?? "",
            unit: data.unit || "",
            store: data.store || data.vendor || "",
            date: sanitizeDate(data.date || data.purchaseDate || ""),
            memo: data.memo || ""
        };
    }

    function sanitizeDate(input) {
        if (typeof input !== "string") {
            return "";
        }
        const candidate = input.trim();
        if (!candidate) {
            return "";
        }
        const normalized = dayjs(candidate).isValid() ? dayjs(candidate).format("YYYY-MM-DD") : "";
        return normalized;
    }

    function buildEmptyProduct() {
        return {
            id: null,
            name: "",
            price: "",
            quantity: "",
            unit: "",
            store: "",
            date: dayjs().format("YYYY-MM-DD"),
            memo: ""
        };
    }

    function fillForm(product) {
        elements.productName.value = product.name ?? "";
        elements.productPrice.value = product.price ?? "";
        elements.productQuantity.value = product.quantity ?? "";
        elements.productUnit.value = product.unit ?? "";
        elements.productStore.value = product.store ?? "";
        elements.productDate.value = product.date ?? "";
        elements.productMemo.value = product.memo ?? "";
    }

    function closeModal() {
        elements.modal.classList.add("hidden");
        elements.modalForm.reset();
        state.editingId = null;
    }

    function handleModalSubmit(event) {
        event.preventDefault();
        const collected = collectFormValues();
        if (!collected.name.trim()) {
            window.alert("商品名を入力してください。");
            return;
        }
        if (Number.isNaN(collected.price) || collected.price <= 0) {
            window.alert("価格は1以上の数値にしてください。");
            return;
        }
        if (Number.isNaN(collected.quantity) || collected.quantity <= 0) {
            window.alert("内容量は1以上の数値にしてください。");
            return;
        }
        if (!collected.unit.trim()) {
            window.alert("単位を入力してください。");
            return;
        }
        if (!collected.store.trim()) {
            window.alert("店舗名を入力してください。");
            return;
        }
        if (!collected.date) {
            window.alert("購入日を入力してください。");
            return;
        }
        if (state.editingId) {
            updateProduct(collected);
        } else {
            addProduct(collected);
        }
        closeModal();
        renderProducts();
        persistProducts();
    }

    function collectFormValues() {
        const price = Number.parseFloat(elements.productPrice.value);
        const quantity = Number.parseFloat(elements.productQuantity.value);
        return {
            id: state.editingId || Date.now().toString(),
            name: elements.productName.value.trim(),
            price,
            quantity,
            unit: elements.productUnit.value.trim(),
            store: elements.productStore.value.trim(),
            date: elements.productDate.value,
            memo: elements.productMemo.value.trim(),
            unitPrice: calculateUnitPrice(price, quantity),
            rawText: state.lastRawText
        };
    }

    function calculateUnitPrice(price, quantity) {
        if (!quantity || Number.isNaN(quantity) || Number.isNaN(price) || price < 0) {
            return 0;
        }
        return Number.parseFloat((price / quantity).toFixed(4));
    }

    function addProduct(product) {
        state.products.push(product);
    }

    function updateProduct(product) {
        const index = state.products.findIndex(item => item.id === state.editingId);
        if (index === -1) {
            return;
        }
        state.products[index] = { ...product };
    }

    function handleSearch(event) {
        state.searchQuery = event.target.value.toLowerCase();
        renderProducts();
    }

    function renderProducts() {
        const fragment = document.createDocumentFragment();
        const filtered = getFilteredProducts();
        const sorted = [...filtered].sort((a, b) => a.unitPrice - b.unitPrice);
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
        row.querySelector('[data-field="quantity"]').textContent = `${product.quantity} ${product.unit}`;
        row.querySelector('[data-field="unitPrice"]').textContent = `${formatCurrency(product.unitPrice)} / ${product.unit}`;
        row.querySelector('[data-field="store"]').textContent = product.store;
        row.querySelector('[data-field="date"]').textContent = dayjs(product.date).format("YYYY-MM-DD");
    }

    function formatCurrency(value) {
        const number = Number(value) || 0;
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
                if (action === "edit") {
                    startEdit(productId);
                }
                if (action === "delete") {
                    deleteProduct(productId);
                }
            });
        });
    }

    function startEdit(productId) {
        const target = state.products.find(product => product.id === productId);
        if (!target) {
            return;
        }
        state.editingId = productId;
        state.lastRawText = target.rawText || "";
        displayRawText(state.lastRawText);
        fillForm(target);
        elements.modalTitle.textContent = "商品を編集";
        elements.modal.classList.remove("hidden");
        window.requestAnimationFrame(() => {
            elements.productName.focus();
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
                    ...item,
                    unitPrice: calculateUnitPrice(Number(item.price), Number(item.quantity))
                }));
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
