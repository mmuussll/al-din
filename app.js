/**
 * ====================================
 * تطبيق إدارة الديون - الديون المستحقة لي
 * الإصدار: 1.0.0
 * التخزين: LocalStorage (محلي بالكامل)
 * ====================================
 */

// ==================== الحالة العامة للتطبيق ====================
const APP = {
    debtors: [],
    currentFilter: 'all',
    currentDebtorId: null,
    chart: null,
    monthlyChart: null,
    debtorsChart: null,
    timelineChart: null,
    selectedDebtorIds: new Set(),
    activityLog: [],
    notifications: [],
    settings: {
        defaultCurrency: 'SAR',
        reminderDays: 7,
        whatsappCountryCode: '966',
        enableNotifications: true,
        autoBackup: false,
        enablePassword: false,
        enableEncryption: false,
        userName: '',
        interestRate: 0,
        gracePeriodDays: 0,
        autoInterest: false
    },
    rates: {
        SAR: 1, AED: 1.02, KWD: 12.25, USD: 3.75, EUR: 4.05, EGP: 0.077,
        QAR: 1.03, BHD: 9.95, OMR: 9.74, JOD: 5.29, IQD: 0.0029, YER: 0.015,
        MAD: 0.37, DZD: 0.028, TND: 1.21, LYD: 0.77, SDG: 0.0062
    },
    goals: { monthly: 0, yearly: 0 },
    templates: [],
    periodComparison: 'all'
};

const STORAGE_KEY = 'debt_management_data_v1';
const THEME_KEY = 'debt_app_theme';
const SETTINGS_KEY = 'debt_app_settings';
const ACTIVITY_KEY = 'debt_activity_log';
const GOALS_KEY = 'debt_goals';
const TEMPLATES_KEY = 'debt_templates';

// ==================== أدوات مساعدة ====================

function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    let date;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
        date = new Date(dateStr);
    }
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    const countryCode = (APP.settings && APP.settings.whatsappCountryCode) || '966';
    if (cleaned.startsWith('0')) {
        cleaned = countryCode + cleaned.substring(1);
    }
    return cleaned;
}

function safeCreateIcons() {
    if (typeof lucide !== 'undefined') {
        try { lucide.createIcons(); } catch (e) { console.warn('lucide error', e); }
    }
}

function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    toast.innerHTML = '<i data-lucide="' + (icons[type] || 'info') + '" class="toast-icon"></i>' +
                      '<span class="toast-message">' + message + '</span>';

    container.appendChild(toast);
    safeCreateIcons();

    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3500);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.hidden = true;
        document.body.style.overflow = '';
    }
}

function getInitials(name) {
    if (!name) return '؟';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return parts[0][0] + parts[1][0];
    }
    return name[0];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, wait) {
    let timeout;
    return function() {
        const ctx = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() { fn.apply(ctx, args); }, wait);
    };
}

// ==================== التخزين المحلي ====================

function loadData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            APP.debtors = JSON.parse(data);
        } else {
            APP.debtors = [];
        }
    } catch (e) {
        console.error('خطأ في تحميل البيانات:', e);
        APP.debtors = [];
    }
}

function saveData() {
    invalidateTotalsCache();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(APP.debtors));
    } catch (e) {
        console.error('خطأ في حفظ البيانات:', e);
    }
}

function loadSettings() {
    try {
        const data = localStorage.getItem(SETTINGS_KEY);
        if (data) {
            const s = JSON.parse(data);
            Object.assign(APP.settings, s);
        }
    } catch (e) {
        console.error('خطأ في تحميل الإعدادات:', e);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(APP.settings));
    } catch (e) {
        console.error('خطأ في حفظ الإعدادات:', e);
    }
}

function loadActivity() {
    try {
        const data = localStorage.getItem(ACTIVITY_KEY);
        if (data) {
            APP.activityLog = JSON.parse(data);
        }
    } catch (e) {
        console.error('خطأ في تحميل سجل النشاط:', e);
        APP.activityLog = [];
    }
}

function logActivity(type, description, meta) {
    const entry = {
        id: generateId(),
        type: type,
        description: description,
        meta: meta || {},
        timestamp: new Date().toISOString()
    };
    APP.activityLog.unshift(entry);
    if (APP.activityLog.length > 500) {
        APP.activityLog = APP.activityLog.slice(0, 500);
    }
    try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(APP.activityLog));
    } catch (e) {
        console.warn('فشل حفظ سجل النشاط', e);
    }
}

function loadGoals() {
    try {
        const data = localStorage.getItem(GOALS_KEY);
        if (data) APP.goals = JSON.parse(data);
    } catch (e) {}
}

function saveGoals() {
    try {
        localStorage.setItem(GOALS_KEY, JSON.stringify(APP.goals));
    } catch (e) {}
}

function loadTemplates() {
    try {
        const data = localStorage.getItem(TEMPLATES_KEY);
        if (data) APP.templates = JSON.parse(data);
        else {
            APP.templates = [
                { id: generateId(), name: 'تذكير ودود', body: 'السلام عليكم {name}، نذكركم بمبلغ {amount} مستحق عليكم. شكراً لتعاونكم.' },
                { id: generateId(), name: 'تذكير رسمي', body: 'السيد/ة {name} المحترم/ة، نود تذكيركم بوجود رصيد مستحق قدره {amount}، نأمل السداد.' },
                { id: generateId(), name: 'شكر للسداد', body: 'شكراً جزيلاً {name} على سداد مبلغ {amount}. نقدّر تعاونكم.' }
            ];
            saveTemplates();
        }
    } catch (e) {}
}

function saveTemplates() {
    try {
        localStorage.setItem(TEMPLATES_KEY, JSON.stringify(APP.templates));
    } catch (e) {}
}

// ==================== إدارة المديونين ====================

function saveDebtor(event) {
    event.preventDefault();

    const id = document.getElementById('debtorId').value;
    const name = document.getElementById('debtorName').value.trim();
    const phone = document.getElementById('debtorPhone').value.trim();
    const notes = document.getElementById('debtorNotes').value.trim();
    const debtDateInput = document.getElementById('debtorDate').value;
    const debtDateMode = document.getElementById('debtorDateMode').value;
    const lastContact = document.getElementById('debtorLastContact').value || null;
    const nextCall = document.getElementById('debtorNextCall').value || null;

    const products = collectDebtorProducts();
    const productsTotal = products.reduce(function(s, p) { return s + (parseFloat(p.subtotal) || 0); }, 0);

    const nameOrPlaceholder = name || 'مديون بدون اسم';

    if (id) {
        const debtor = APP.debtors.find(function(d) { return d.id === id; });
        if (debtor) {
            debtor.name = nameOrPlaceholder;
            debtor.phone = phone;
            debtor.notes = notes;
            debtor.products = products;
            debtor.productsTotal = productsTotal;
            debtor.lastContactDate = lastContact;
            debtor.nextCallDate = nextCall;
            debtor.archived = document.getElementById('debtorArchived').value === 'true';
            showToast('تم تحديث بيانات المديون بنجاح', 'success');
            logActivity('debtor_updated', 'تم تحديث بيانات ' + nameOrPlaceholder, { id: id });
        }
    } else {
        const debtorId = generateId();
        const newDebtor = {
            id: debtorId,
            name: nameOrPlaceholder,
            phone: phone,
            notes: notes,
            products: products,
            productsTotal: productsTotal,
            lastContactDate: lastContact,
            nextCallDate: nextCall,
            archived: false,
            trustScore: 100,
            createdAt: new Date().toISOString(),
            transactions: products.length > 0 ? products.map(function(p) {
                return {
                    id: generateId(),
                    type: 'debt',
                    amount: parseFloat(p.subtotal) || 0,
                    currency: '',
                    date: debtDateInput || getTodayDate(),
                    dueDate: '',
                    description: p.name ? ('منتج: ' + p.name) : 'منتج',
                    createdAt: new Date().toISOString()
                };
            }) : [],
            installments: [],
            checks: [],
            promises: [],
            callLogs: [],
            attachments: []
        };
        APP.debtors.push(newDebtor);
        showToast('تم إضافة المديون بنجاح', 'success');
        logActivity('debtor_added', 'إضافة مديون جديد: ' + nameOrPlaceholder, { id: debtorId });
    }

    saveData();
    renderAll();
    closeModal('debtorModal');
    document.getElementById('debtorForm').reset();
    document.getElementById('debtorArchived').value = 'false';
    resetDebtorProducts();
    applyDateQuickMode('today', 0);
}

// ==================== منتجات المديون ====================

const DEBTOR_PRODUCTS_STATE = { rows: [] };

function addProductRow(initial) {
    const product = initial || { name: '', price: '', qty: 1 };
    const id = generateId();
    DEBTOR_PRODUCTS_STATE.rows.push(Object.assign({ _id: id }, product));

    const list = document.getElementById('debtorProductsList');
    if (!list) return;
    if (list.querySelector('.empty-products')) list.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'product-row';
    row.dataset.rowId = id;
    row.innerHTML =
        '<input type="text" class="p-name" placeholder="اسم المنتج">' +
        '<input type="number" class="p-price" placeholder="السعر" min="0" step="0.01">' +
        '<input type="number" class="p-qty" placeholder="الكمية" min="1" step="1" value="1">' +
        '<div class="p-subtotal">0</div>' +
        '<button type="button" class="btn-icon-sm p-del" title="حذف"><i data-lucide="trash-2"></i></button>';
    list.appendChild(row);

    const nameEl = row.querySelector('.p-name');
    const priceEl = row.querySelector('.p-price');
    const qtyEl = row.querySelector('.p-qty');
    nameEl.value = product.name || '';
    priceEl.value = product.price === '' || product.price == null ? '' : product.price;
    qtyEl.value = product.qty || 1;

    const recalc = function() {
        const price = parseFloat(priceEl.value) || 0;
        const qty = parseFloat(qtyEl.value) || 0;
        const subtotal = price * qty;
        row.querySelector('.p-subtotal').textContent = formatCurrency(subtotal);
        updateProductsTotal();
    };

    nameEl.addEventListener('input', recalc);
    priceEl.addEventListener('input', recalc);
    qtyEl.addEventListener('input', recalc);

    row.querySelector('.p-del').addEventListener('click', function() {
        DEBTOR_PRODUCTS_STATE.rows = DEBTOR_PRODUCTS_STATE.rows.filter(function(r) { return r._id !== id; });
        row.remove();
        updateProductsTotal();
        if (DEBTOR_PRODUCTS_STATE.rows.length === 0) {
            list.innerHTML = '<div class="empty-products">لم تُضف منتجات بعد</div>';
        }
    });

    recalc();
    safeCreateIcons();
}

function collectDebtorProducts() {
    const list = document.getElementById('debtorProductsList');
    if (!list) return DEBTOR_PRODUCTS_STATE.rows;
    const rows = [];
    list.querySelectorAll('.product-row').forEach(function(row) {
        const name = row.querySelector('.p-name').value.trim();
        const price = parseFloat(row.querySelector('.p-price').value) || 0;
        const qty = parseFloat(row.querySelector('.p-qty').value) || 1;
        if (!name && price === 0) return;
        rows.push({
            id: row.dataset.rowId,
            name: name,
            price: price,
            qty: qty,
            subtotal: price * qty
        });
    });
    return rows;
}

function updateProductsTotal() {
    const total = collectDebtorProducts().reduce(function(s, p) { return s + (p.subtotal || 0); }, 0);
    const t = document.getElementById('debtorProductsTotal');
    if (t) {
        t.hidden = total === 0;
        t.querySelector('strong').textContent = formatCurrency(total);
    }
}

function resetDebtorProducts() {
    DEBTOR_PRODUCTS_STATE.rows = [];
    const list = document.getElementById('debtorProductsList');
    if (list) list.innerHTML = '<div class="empty-products">لم تُضف منتجات بعد</div>';
    const t = document.getElementById('debtorProductsTotal');
    if (t) t.hidden = true;
}

function loadDebtorProducts(products) {
    resetDebtorProducts();
    (products || []).forEach(function(p) { addProductRow({ name: p.name, price: p.price, qty: p.qty }); });
}

// ==================== التاريخ التلقائي ====================

function applyDateQuickMode(mode, offset) {
    document.querySelectorAll('.date-quick-btn').forEach(function(b) {
        b.classList.remove('active');
        if (mode === 'custom') {
            if (b.dataset.dateMode === 'custom') b.classList.add('active');
        } else {
            if (b.dataset.dateMode === mode && String(b.dataset.offset) === String(offset)) b.classList.add('active');
        }
    });
    document.getElementById('debtorDateMode').value = mode;
    document.getElementById('debtorDateOffset').value = offset;
    const dateInput = document.getElementById('debtorDate');
    if (mode === 'today') {
        const today = new Date();
        today.setDate(today.getDate() + parseInt(offset));
        dateInput.value = today.toISOString().split('T')[0];
        dateInput.hidden = true;
    } else {
        if (!dateInput.value) dateInput.value = getTodayDate();
        dateInput.hidden = false;
    }
}

function setupDebtorForm() {
    const addBtn = document.getElementById('addProductRowBtn');
    if (addBtn) addBtn.addEventListener('click', function() { addProductRow(); });
    document.querySelectorAll('.date-quick-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (btn.dataset.dateMode === 'custom') {
                applyDateQuickMode('custom', 0);
            } else {
                applyDateQuickMode(btn.dataset.dateMode, parseInt(btn.dataset.offset));
            }
        });
    });
    const dInput = document.getElementById('debtorDate');
    if (dInput) dInput.addEventListener('input', function() {
        applyDateQuickMode('custom', 0);
    });
    applyDateQuickMode('today', 0);
}

// ==================== إدارة الأقساط ====================

function saveInstallment(event) {
    event.preventDefault();
    const debtorId = document.getElementById('installmentDebtorId').value;
    const amount = parseFloat(document.getElementById('installmentAmount').value);
    const totalInstallments = parseInt(document.getElementById('installmentCount').value);
    const startDate = document.getElementById('installmentStartDate').value;
    const description = document.getElementById('installmentDescription').value.trim();
    const frequency = document.getElementById('installmentFrequency').value;

    if (!amount || amount <= 0) { showToast('أدخل مبلغ صحيح', 'warning'); return; }
    if (!totalInstallments || totalInstallments < 1) { showToast('عدد الأقساط غير صحيح', 'warning'); return; }
    if (!startDate) { showToast('حدد تاريخ البدء', 'warning'); return; }

    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    if (!debtor.installments) debtor.installments = [];

    const installmentAmount = amount / totalInstallments;
    const schedule = [];
    const start = new Date(startDate);
    const intervalDays = { monthly: 30, weekly: 7, biweekly: 15, quarterly: 90 }[frequency] || 30;

    for (let i = 0; i < totalInstallments; i++) {
        const due = new Date(start.getTime() + (i * intervalDays * 86400000));
        schedule.push({
            id: generateId(),
            number: i + 1,
            amount: installmentAmount,
            dueDate: due.toISOString().split('T')[0],
            status: 'pending',
            paidDate: null,
            paidAmount: 0
        });
    }

    const installment = {
        id: generateId(),
        description: description || 'دين بالأقساط',
        totalAmount: amount,
        totalInstallments: totalInstallments,
        frequency: frequency,
        startDate: startDate,
        createdAt: new Date().toISOString(),
        schedule: schedule,
        status: 'active'
    };

    debtor.installments.push(installment);
    debtor.transactions.push({
        id: generateId(),
        type: 'debt',
        amount: amount,
        date: startDate,
        dueDate: schedule[schedule.length - 1].dueDate,
        description: 'قسط: ' + (description || 'دين مقسط'),
        installmentId: installment.id,
        createdAt: new Date().toISOString()
    });

    saveData();
    renderAll();
    closeModal('installmentModal');
    document.getElementById('installmentForm').reset();
    showDebtorDetails(debtorId);
    showToast('تم إنشاء خطة الأقساط بنجاح', 'success');
    logActivity('installment_created', 'خطة أقساط بقيمة ' + amount + ' لـ ' + debtor.name, { debtorId: debtorId });
}

function payInstallment(installmentId, scheduleId) {
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;
    const inst = (debtor.installments || []).find(function(i) { return i.id === installmentId; });
    if (!inst) return;
    const sched = inst.schedule.find(function(s) { return s.id === scheduleId; });
    if (!sched || sched.status === 'paid') return;

    sched.status = 'paid';
    sched.paidDate = getTodayDate();
    sched.paidAmount = sched.amount;

    debtor.transactions.push({
        id: generateId(),
        type: 'payment',
        debtId: null,
        amount: sched.amount,
        date: getTodayDate(),
        notes: 'سداد قسط #' + sched.number + ' من: ' + inst.description,
        installmentId: installmentId,
        createdAt: new Date().toISOString()
    });

    if (inst.schedule.every(function(s) { return s.status === 'paid'; })) {
        inst.status = 'completed';
    }

    saveData();
    renderAll();
    showDebtorDetails(APP.currentDebtorId);
    showToast('تم تسجيل سداد القسط', 'success');
    logActivity('installment_paid', 'سداد قسط ' + sched.amount, { debtorId: debtor.id });
}

// ==================== إدارة الشيكات ====================

function saveCheck(event) {
    event.preventDefault();
    const debtorId = document.getElementById('checkDebtorId').value;
    const amount = parseFloat(document.getElementById('checkAmount').value);
    const checkNumber = document.getElementById('checkNumber').value.trim();
    const bankName = document.getElementById('checkBank').value.trim();
    const dueDate = document.getElementById('checkDueDate').value;
    const notes = document.getElementById('checkNotes').value.trim();

    if (!amount || amount <= 0) { showToast('أدخل مبلغ', 'warning'); return; }
    if (!dueDate) { showToast('حدد تاريخ الاستحقاق', 'warning'); return; }

    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    if (!debtor.checks) debtor.checks = [];

    debtor.checks.push({
        id: generateId(),
        amount: amount,
        checkNumber: checkNumber,
        bankName: bankName,
        dueDate: dueDate,
        notes: notes,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    saveData();
    renderAll();
    closeModal('checkModal');
    document.getElementById('checkForm').reset();
    showDebtorDetails(debtorId);
    showToast('تم إضافة الشيك', 'success');
    logActivity('check_added', 'شيك رقم ' + checkNumber + ' بقيمة ' + amount, { debtorId: debtorId });
}

function updateCheckStatus(checkId, newStatus) {
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;
    const check = (debtor.checks || []).find(function(c) { return c.id === checkId; });
    if (!check) return;

    check.status = newStatus;
    if (newStatus === 'cashed') {
        check.cashedDate = getTodayDate();
        debtor.transactions.push({
            id: generateId(),
            type: 'payment',
            debtId: null,
            amount: check.amount,
            date: getTodayDate(),
            notes: 'تحصيل شيك رقم ' + check.checkNumber,
            createdAt: new Date().toISOString()
        });
    }

    saveData();
    renderAll();
    showDebtorDetails(APP.currentDebtorId);
    showToast('تم تحديث حالة الشيك', 'success');
}

// ==================== إدارة الوعود ====================

function savePromise(event) {
    event.preventDefault();
    const debtorId = document.getElementById('promiseDebtorId').value;
    const amount = parseFloat(document.getElementById('promiseAmount').value);
    const promiseDate = document.getElementById('promiseDate').value;
    const notes = document.getElementById('promiseNotes').value.trim();

    if (!amount || amount <= 0) { showToast('أدخل مبلغ', 'warning'); return; }
    if (!promiseDate) { showToast('حدد تاريخ الوعد', 'warning'); return; }

    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    if (!debtor.promises) debtor.promises = [];

    debtor.promises.push({
        id: generateId(),
        amount: amount,
        promiseDate: promiseDate,
        notes: notes,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    saveData();
    renderAll();
    closeModal('promiseModal');
    document.getElementById('promiseForm').reset();
    showDebtorDetails(debtorId);
    showToast('تم تسجيل وعد الدفع', 'success');
    logActivity('promise_added', 'وعد سداد ' + amount + ' بتاريخ ' + promiseDate, { debtorId: debtorId });
}

function updatePromiseStatus(promiseId, newStatus) {
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;
    const promise = (debtor.promises || []).find(function(p) { return p.id === promiseId; });
    if (!promise) return;

    promise.status = newStatus;
    if (newStatus === 'kept') {
        promise.completedDate = getTodayDate();
    }

    saveData();
    renderAll();
    showDebtorDetails(APP.currentDebtorId);
    showToast('تم تحديث حالة الوعد', 'success');
}

// ==================== المرفقات ====================

function handleAttachment(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;

    Array.from(files).forEach(function(file) {
        if (file.size > 2 * 1024 * 1024) {
            showToast('الملف ' + file.name + ' أكبر من 2 ميجا', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            if (!debtor.attachments) debtor.attachments = [];
            debtor.attachments.push({
                id: generateId(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                uploadedAt: new Date().toISOString()
            });
            saveData();
            renderDebtorDetails(debtor);
            showToast('تم إرفاق ' + file.name, 'success');
        };
        reader.readAsDataURL(file);
    });
    event.target.value = '';
}

function deleteAttachment(attId) {
    showConfirm('حذف هذا المرفق؟', function() {
        const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
        if (!debtor) return;
        debtor.attachments = (debtor.attachments || []).filter(function(a) { return a.id !== attId; });
        saveData();
        renderDebtorDetails(debtor);
        showToast('تم حذف المرفق', 'success');
    });
}

// ==================== التحويل بين العملات ====================

function convertCurrency(amount, fromCurrency, toCurrency) {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
    const fromRate = APP.rates[fromCurrency] || 1;
    const toRate = APP.rates[toCurrency] || 1;
    return (amount / fromRate) * toRate;
}

function getCurrencySymbol(code) {
    const symbols = {
        SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', USD: '$', EUR: '€', EGP: 'ج.م',
        QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', JOD: 'د.أ', IQD: 'د.ع', YER: 'ر.ي',
        MAD: 'د.م', DZD: 'د.ج', TND: 'د.ت', LYD: 'د.ل', SDG: 'ج.س'
    };
    return symbols[code] || code;
}

function getDefaultCurrencySymbol() {
    return getCurrencySymbol((APP.settings && APP.settings.defaultCurrency) || 'SAR');
}

function populateReportDebtorSelect() {
    const select = document.getElementById('reportDebtor');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">اختر مديون</option>';
    APP.debtors.forEach(function(d) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        select.appendChild(opt);
    });
    if (currentValue) select.value = currentValue;
}

function deleteDebtor(debtorId) {
    showConfirm('هل أنت متأكد من حذف هذا المديون وكامل سجلاته؟ لا يمكن التراجع عن هذا الإجراء.', function() {
        const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
        const name = debtor ? debtor.name : '';
        APP.debtors = APP.debtors.filter(function(d) { return d.id !== debtorId; });
        saveData();
        renderAll();
        closeModal('debtorDetailsModal');
        logActivity('debtor_deleted', 'حذف المديون: ' + name, { id: debtorId });
        showToast('تم حذف المديون بنجاح', 'success');
    });
}

function editDebtor(debtorId) {
    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    document.getElementById('debtorId').value = debtor.id;
    document.getElementById('debtorName').value = (debtor.name === 'مديون بدون اسم' ? '' : (debtor.name || ''));
    document.getElementById('debtorPhone').value = debtor.phone || '';
    document.getElementById('debtorNotes').value = debtor.notes || '';
    document.getElementById('debtorLastContact').value = debtor.lastContactDate || '';
    document.getElementById('debtorNextCall').value = debtor.nextCallDate || '';
    document.getElementById('debtorArchived').value = debtor.archived ? 'true' : 'false';

    loadDebtorProducts(debtor.products);

    const existingTxDate = (debtor.transactions || []).filter(function(t) { return t.type === 'debt'; })
        .map(function(t) { return t.date; }).sort()[0];
    if (existingTxDate) {
        applyDateQuickMode('custom', 0);
        document.getElementById('debtorDate').value = existingTxDate;
    } else {
        applyDateQuickMode('today', 0);
    }

    document.getElementById('debtorModalTitle').innerHTML = '<i data-lucide="edit"></i> تعديل بيانات المديون';
    safeCreateIcons();

    openModal('debtorModal');
}

// ==================== إدارة الديون ====================

function saveDebt(event) {
    event.preventDefault();

    const debtorId = APP.currentDebtorId;
    if (!debtorId) return;

    const amount = parseFloat(document.getElementById('debtAmount').value);
    const date = document.getElementById('debtDate').value;
    const dueDate = document.getElementById('debtDueDate').value;
    const description = document.getElementById('debtDescription').value.trim();

    if (!amount || amount <= 0) {
        showToast('يرجى إدخال مبلغ صحيح', 'warning');
        return;
    }

    if (!date) {
        showToast('يرجى تحديد تاريخ الدين', 'warning');
        return;
    }

    if (!description) {
        showToast('يرجى إدخال وصف الدين', 'warning');
        return;
    }

    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    debtor.transactions.push({
        id: generateId(),
        type: 'debt',
        amount: amount,
        date: date,
        dueDate: dueDate,
        description: description,
        currency: document.getElementById('debtCurrency').value || '',
        createdAt: new Date().toISOString()
    });

    saveData();
    renderAll();
    closeModal('debtModal');
    document.getElementById('debtForm').reset();
    showDebtorDetails(debtorId);
    logActivity('debt_added', 'دين جديد: ' + description + ' - ' + amount, { debtorId: debtorId });
    showToast('تم إضافة الدين بنجاح', 'success');
}

// ==================== إدارة السدادات ====================

function openPaymentModal(transactionId) {
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;

    const transaction = debtor.transactions.find(function(t) { return t.id === transactionId; });
    if (!transaction) return;

    const paidSoFar = debtor.transactions
        .filter(function(t) { return t.type === 'payment' && t.debtId === transactionId; })
        .reduce(function(sum, t) { return sum + t.amount; }, 0);

    const remaining = transaction.amount - paidSoFar;

    if (remaining <= 0) {
        showToast('هذا الدين مسدد بالكامل', 'warning');
        return;
    }

    document.getElementById('paymentForm').dataset.debtId = transactionId;

    document.getElementById('paymentInfo').innerHTML =
        '<div class="payment-info-amount">' + formatCurrency(remaining) + ' ' + getDefaultCurrencySymbol() + '</div>' +
        '<div class="payment-info-text">المبلغ المتبقي من دين: <strong>' + escapeHtml(transaction.description) + '</strong></div>';

    document.getElementById('paymentAmount').value = remaining.toFixed(2);
    document.getElementById('paymentAmount').max = remaining.toFixed(2);
    document.getElementById('paymentDate').value = getTodayDate();

    openModal('paymentModal');
}

function savePayment(event) {
    event.preventDefault();

    const debtId = document.getElementById('paymentForm').dataset.debtId;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const date = document.getElementById('paymentDate').value;
    const notes = document.getElementById('paymentNotes').value.trim();

    if (!amount || amount <= 0) {
        showToast('يرجى إدخال مبلغ صحيح', 'warning');
        return;
    }

    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;

    debtor.transactions.push({
        id: generateId(),
        type: 'payment',
        debtId: debtId,
        amount: amount,
        date: date,
        method: document.getElementById('paymentMethod').value,
        notes: notes,
        createdAt: new Date().toISOString()
    });

    saveData();
    renderAll();
    closeModal('paymentModal');
    document.getElementById('paymentForm').reset();
    showDebtorDetails(APP.currentDebtorId);
    logActivity('payment_added', 'سداد ' + amount, { debtorId: APP.currentDebtorId });
    showToast('تم تسجيل السداد بنجاح', 'success');
}

function deleteTransaction(transactionId) {
    showConfirm('هل تريد حذف هذه العملية؟', function() {
        const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
        if (!debtor) return;
        debtor.transactions = debtor.transactions.filter(function(t) { return t.id !== transactionId; });
        saveData();
        renderAll();
        showDebtorDetails(APP.currentDebtorId);
        showToast('تم حذف العملية', 'success');
    });
}

// ==================== حساب الإحصائيات ====================

function getPaymentTotalsByDebt(debtor) {
    const map = {};
    if (!debtor.transactions) return map;
    debtor.transactions.forEach(function(t) {
        if (t.type === 'payment' && t.debtId) {
            map[t.debtId] = (map[t.debtId] || 0) + t.amount;
        }
    });
    return map;
}

const _totalsCache = new Map();
function invalidateTotalsCache(debtorId) {
    if (debtorId) _totalsCache.delete(debtorId);
    else _totalsCache.clear();
}

function getDebtorTotals(debtor) {
    if (_totalsCache.has(debtor.id)) return _totalsCache.get(debtor.id);

    let total = 0;
    let paid = 0;
    const paymentsByDebt = getPaymentTotalsByDebt(debtor);
    const debts = [];
    const today = getTodayDate();

    debtor.transactions.forEach(function(t) {
        if (t.type === 'debt') {
            total += t.amount;
            debts.push(t);
        } else if (t.type === 'payment') {
            paid += t.amount;
        }
    });

    let overdueCount = 0;
    let overdueAmount = 0;
    debts.forEach(function(t) {
        const debtPaid = paymentsByDebt[t.id] || 0;
        const remaining = t.amount - debtPaid;
        if (t.dueDate && t.dueDate < today && remaining > 0) {
            overdueCount++;
            overdueAmount += remaining;
        }
    });

    let checksTotal = 0;
    if (debtor.checks) {
        debtor.checks.forEach(function(c) {
            if (c.status === 'pending') checksTotal += c.amount;
        });
    }

    let promisesCount = 0;
    if (debtor.promises) {
        promisesCount = debtor.promises.filter(function(p) { return p.status === 'pending'; }).length;
    }

    const remaining = total - paid;
    let interest = 0;
    if (APP.settings.autoInterest && APP.settings.interestRate > 0 && remaining > 0) {
        const grace = APP.settings.gracePeriodDays || 0;
        debts.forEach(function(t) {
            const debtPaid = paymentsByDebt[t.id] || 0;
            const rem = t.amount - debtPaid;
            if (t.dueDate && t.dueDate < today && rem > 0) {
                const days = Math.floor((new Date(today) - new Date(t.dueDate)) / 86400000);
                interest += (rem * APP.settings.interestRate / 100) * Math.max(0, days - grace) / 365;
            }
        });
    }

    const result = {
        total: total,
        paid: paid,
        remaining: remaining,
        overdueCount: overdueCount,
        overdueAmount: overdueAmount,
        checksTotal: checksTotal,
        promisesCount: promisesCount,
        interest: interest,
        effectiveRemaining: remaining + interest,
        progress: total > 0 ? Math.round((paid / total) * 100) : 0
    };
    _totalsCache.set(debtor.id, result);
    return result;
}

function calculateTrustScore(debtor, totals) {
    let score = 100;
    if (!totals) totals = getDebtorTotals(debtor);
    score -= totals.overdueCount * 15;
    if (debtor.promises) {
        const brokenPromises = debtor.promises.filter(function(p) { return p.status === 'broken'; }).length;
        const keptPromises = debtor.promises.filter(function(p) { return p.status === 'kept'; }).length;
        score -= brokenPromises * 10;
        score += keptPromises * 3;
    }
    if (debtor.checks) {
        const bouncedChecks = debtor.checks.filter(function(c) { return c.status === 'bounced'; }).length;
        score -= bouncedChecks * 25;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

// ==================== العرض (Rendering) ====================

let _renderScheduled = false;
function scheduleRender(fn) {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(function() {
        _renderScheduled = false;
        fn();
    });
}

function renderAll() {
    invalidateTotalsCache();
    renderStats();
    renderDebtors();
    renderChart();
    renderProgress();
    renderGoals();
    renderPeriodComparison();
    safeCreateIcons();
}

function switchView(viewName) {
    document.querySelectorAll('.view-container').forEach(function(v) {
        v.hidden = true;
        v.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    const view = document.getElementById('view-' + viewName);
    if (view) {
        view.hidden = false;
        view.classList.add('active');
    }
    const tab = document.querySelector('.tab-btn[data-view="' + viewName + '"]');
    if (tab) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
    }
    if (viewName === 'analytics') renderAnalytics();
    else if (viewName === 'archive') renderArchive();
    else if (viewName === 'debtors-list') renderDebtorsList();
    safeCreateIcons();
}

function renderArchive() {
    const grid = document.getElementById('archiveGrid');
    const empty = document.getElementById('archiveEmpty');
    if (!grid) return;
    const archived = APP.debtors.filter(function(d) { return d.archived; });
    if (archived.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < archived.length; i++) {
        const debtor = archived[i];
        const totals = getDebtorTotals(debtor);
        const card = document.createElement('div');
        card.className = 'debtor-card';
        card.innerHTML =
            '<span class="debtor-status status-paid">مؤرشف</span>' +
            '<div class="debtor-card-header">' +
                '<div class="debtor-avatar">' + getInitials(debtor.name) + '</div>' +
                '<div class="debtor-info">' +
                    '<div class="debtor-name">' + escapeHtml(debtor.name) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="debtor-amounts">' +
                '<div class="amount-item amount-paid"><small>المسددة</small><strong>' + formatCurrency(totals.paid) + '</strong></div>' +
                '<div class="amount-item amount-remaining"><small>المتبقية</small><strong>' + formatCurrency(totals.remaining) + '</strong></div>' +
            '</div>' +
            '<div class="debtor-actions">' +
                '<button class="btn-primary btn-sm" data-action="details" data-id="' + debtor.id + '"><i data-lucide="eye"></i> عرض</button>' +
                '<button class="btn-secondary btn-sm" data-action="unarchive" data-id="' + debtor.id + '"><i data-lucide="archive-restore"></i> استعادة</button>' +
            '</div>';
        fragment.appendChild(card);
    }
    grid.innerHTML = '';
    grid.appendChild(fragment);
    safeCreateIcons();
}

// ==================== قائمة المديونين التفصيلية ====================

const DEBTORS_LIST_STATE = {
    search: '',
    filter: 'all',
    initialized: false
};

function renderDebtorsList() {
    const tbody = document.getElementById('debtorsTableBody');
    const empty = document.getElementById('debtorsListEmpty');
    const statsBox = document.getElementById('debtorsListStats');
    if (!tbody) return;

    const searchTerm = DEBTORS_LIST_STATE.search.toLowerCase().trim();
    const filter = DEBTORS_LIST_STATE.filter;
    const today = getTodayDate();

    const categoryLabels = {
        general: 'عام', family: 'عائلة', friend: 'صديق',
        customer: 'عميل', supplier: 'مورد', employee: 'موظف', other: 'آخر'
    };

    let list = APP.debtors.slice();
    if (filter === 'upcoming') {
        list = list.filter(function(d) { return d.nextCallDate && d.nextCallDate >= today; });
    } else if (filter === 'overdue') {
        list = list.filter(function(d) {
            if (!d.nextCallDate) return false;
            return d.nextCallDate < today;
        });
    } else if (filter === 'no-phone') {
        list = list.filter(function(d) { return !d.phone || d.phone.trim() === ''; });
    }

    if (searchTerm) {
        list = list.filter(function(d) {
            return (d.name || '').toLowerCase().includes(searchTerm) ||
                   (d.phone || '').toLowerCase().includes(searchTerm) ||
                   (d.notes || '').toLowerCase().includes(searchTerm);
        });
    }

    list.sort(function(a, b) { return (a.name || '').localeCompare(b.name || '', 'ar'); });

    let totalDebtors = 0, withPhone = 0, upcomingCalls = 0, overdueCalls = 0;
    for (let i = 0; i < APP.debtors.length; i++) {
        const d = APP.debtors[i];
        totalDebtors++;
        if (d.phone && d.phone.trim() !== '') withPhone++;
        if (d.nextCallDate) {
            if (d.nextCallDate >= today) upcomingCalls++;
            else overdueCalls++;
        }
    }

    if (statsBox) {
        statsBox.innerHTML =
            '<div class="stat-pill"><strong>' + totalDebtors + '</strong> مديون</div>' +
            '<div class="stat-pill"><strong>' + withPhone + '</strong> لديهم هاتف</div>' +
            '<div class="stat-pill"><strong>' + upcomingCalls + '</strong> موعد قادم</div>' +
            '<div class="stat-pill warning"><strong>' + overdueCalls + '</strong> متأخر عن الاتصال</div>';
    }

    if (list.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (let idx = 0; idx < list.length; idx++) {
        const debtor = list[idx];
        const totals = getDebtorTotals(debtor);
        const categoryLabel = categoryLabels[debtor.category] || 'عام';
        const lastContact = debtor.lastContactDate ? formatArabicDate(debtor.lastContactDate) : '<span class="text-muted">لم يسجل</span>';
        let nextCallCell = '<span class="text-muted">غير محدد</span>';
        if (debtor.nextCallDate) {
            const nextDate = formatArabicDate(debtor.nextCallDate);
            if (debtor.nextCallDate < today) {
                nextCallCell = '<span class="call-overdue">' + nextDate + ' <small>(متأخر)</small></span>';
            } else if (debtor.nextCallDate === today) {
                nextCallCell = '<span class="call-today">' + nextDate + ' <small>(اليوم)</small></span>';
            } else {
                nextCallCell = '<span class="call-upcoming">' + nextDate + '</span>';
            }
        }

        const phoneCell = debtor.phone && debtor.phone.trim() !== ''
            ? '<a href="tel:' + escapeHtml(debtor.phone) + '" class="phone-link"><i data-lucide="phone"></i> ' + escapeHtml(debtor.phone) + '</a>'
            : '<span class="text-muted">لا يوجد</span>';

        const remainingClass = totals.remaining > 0 ? 'text-danger' : 'text-success';
        const notesShort = (debtor.notes && debtor.notes.trim() !== '')
            ? escapeHtml(debtor.notes.length > 50 ? debtor.notes.substring(0, 50) + '…' : debtor.notes)
            : '<span class="text-muted">-</span>';

        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + (idx + 1) + '</td>' +
            '<td><strong>' + escapeHtml(debtor.name) + '</strong>' +
                (debtor.archived ? ' <span class="badge-mini">مؤرشف</span>' : '') + '</td>' +
            '<td>' + phoneCell + '</td>' +
            '<td><span class="cat-pill cat-' + escapeHtml(debtor.category || 'general') + '">' + categoryLabel + '</span></td>' +
            '<td>' + lastContact + '</td>' +
            '<td>' + nextCallCell + '</td>' +
            '<td class="' + remainingClass + '"><strong>' + formatCurrency(totals.remaining) + '</strong></td>' +
            '<td class="notes-cell">' + notesShort + '</td>' +
            '<td class="row-actions">' +
                '<button class="btn-icon-sm" data-action="log-call" data-id="' + debtor.id + '" title="تسجيل اتصال" aria-label="تسجيل اتصال"><i data-lucide="phone-call"></i></button>' +
                '<button class="btn-icon-sm" data-action="details" data-id="' + debtor.id + '" title="عرض التفاصيل" aria-label="عرض التفاصيل"><i data-lucide="eye"></i></button>' +
                '<button class="btn-icon-sm" data-action="edit" data-id="' + debtor.id + '" title="تعديل" aria-label="تعديل"><i data-lucide="edit"></i></button>' +
                (debtor.phone && debtor.phone.trim() !== ''
                    ? '<button class="btn-icon-sm btn-whatsapp-icon" data-action="whatsapp" data-id="' + debtor.id + '" title="واتساب" aria-label="إرسال واتساب"><i data-lucide="message-circle"></i></button>'
                    : '') +
            '</td>';
        fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);
    safeCreateIcons();
}

function formatArabicDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return day + '/' + month + '/' + year;
    } catch (e) {
        return dateStr;
    }
}

// ==================== إدارة سجل الاتصالات ====================

function openCallLogModal(debtorId) {
    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;
    document.getElementById('callLogDebtorId').value = debtor.id;
    document.getElementById('callLogDebtorName').value = debtor.name;
    document.getElementById('callLogDate').value = getTodayDate();
    document.getElementById('callLogStatus').value = 'answered';
    document.getElementById('callLogNextDate').value = debtor.nextCallDate || '';
    document.getElementById('callLogNotes').value = '';
    openModal('callLogModal');
}

function saveCallLog(event) {
    event.preventDefault();
    const debtorId = document.getElementById('callLogDebtorId').value;
    const date = document.getElementById('callLogDate').value;
    const status = document.getElementById('callLogStatus').value;
    const nextDate = document.getElementById('callLogNextDate').value;
    const notes = document.getElementById('callLogNotes').value.trim();

    if (!date) { showToast('حدد تاريخ الاتصال', 'warning'); return; }

    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    if (!debtor.callLogs) debtor.callLogs = [];
    debtor.callLogs.unshift({
        id: generateId(),
        date: date,
        status: status,
        nextDate: nextDate || null,
        notes: notes,
        createdAt: new Date().toISOString()
    });

    debtor.lastContactDate = date;
    if (nextDate) debtor.nextCallDate = nextDate;

    saveData();
    renderAll();
    closeModal('callLogModal');
    showToast('تم تسجيل الاتصال بنجاح', 'success');
    logActivity('call_logged', 'تسجيل اتصال مع ' + debtor.name, { id: debtor.id });
}

function renderCallLogs() {
    const container = document.getElementById('callsList');
    if (!container) return;
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;

    const logs = debtor.callLogs || [];
    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="phone-call"></i><h3>لا توجد اتصالات مسجلة</h3><p>سجل اتصالاتك بالمديون لتتبع المتابعة</p></div>';
        safeCreateIcons();
        return;
    }

    const statusLabels = {
        answered: 'تم الرد', 'no-answer': 'لم يرد', busy: 'مشغول',
        promise: 'وعد بالسداد', refused: 'رفض'
    };

    container.innerHTML = logs.map(function(log) {
        return '<div class="call-log-item">' +
            '<div class="call-log-header">' +
                '<span class="call-log-date"><i data-lucide="calendar"></i> ' + formatArabicDate(log.date) + '</span>' +
                '<span class="call-log-status status-' + log.status + '">' + (statusLabels[log.status] || log.status) + '</span>' +
            '</div>' +
            (log.nextDate ? '<div class="call-log-next"><i data-lucide="phone-outgoing"></i> موعد قادم: ' + formatArabicDate(log.nextDate) + '</div>' : '') +
            (log.notes ? '<div class="call-log-notes">' + escapeHtml(log.notes) + '</div>' : '') +
            '<button class="btn-icon-sm btn-delete-call" data-call-id="' + log.id + '" title="حذف"><i data-lucide="trash-2"></i></button>' +
        '</div>';
    }).join('');
    safeCreateIcons();
}

function deleteCallLog(callId) {
    const debtor = APP.debtors.find(function(d) { return d.id === APP.currentDebtorId; });
    if (!debtor) return;
    showConfirm('حذف سجل الاتصال هذا؟', function() {
        debtor.callLogs = (debtor.callLogs || []).filter(function(c) { return c.id !== callId; });
        saveData();
        renderCallLogs();
        showToast('تم الحذف', 'success');
    });
}

function exportDebtorsList() {
    const rows = [['الاسم', 'رقم الهاتف', 'التصنيف', 'تاريخ آخر اتصال', 'موعد الاتصال القادم', 'المتبقي', 'الملاحظات']];
    APP.debtors.forEach(function(d) {
        const totals = getDebtorTotals(d);
        const catLabels = { general: 'عام', family: 'عائلة', friend: 'صديق', customer: 'عميل', supplier: 'مورد', employee: 'موظف', other: 'آخر' };
        rows.push([
            d.name || '',
            d.phone || '',
            catLabels[d.category] || 'عام',
            d.lastContactDate || '',
            d.nextCallDate || '',
            totals.remaining,
            d.notes || ''
        ]);
    });
    const csv = '\ufeff' + rows.map(function(r) {
        return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'debtors-list-' + getTodayDate() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('تم تصدير القائمة', 'success');
}

function renderStats() {
    const stats = getGlobalStats();
    const symbol = getDefaultCurrencySymbol();
    document.getElementById('statTotal').textContent = formatCurrency(stats.totalRequired);
    document.getElementById('statPaid').textContent = formatCurrency(stats.totalPaid);
    document.getElementById('statRemaining').textContent = formatCurrency(stats.totalRemaining);
    document.getElementById('statDebtors').textContent = stats.totalDebtors;
    document.getElementById('statOverdue').textContent = stats.overdueCount;
    const curTotal = document.getElementById('statCurrencyTotal');
    const curPaid = document.getElementById('statCurrencyPaid');
    const curRemaining = document.getElementById('statCurrencyRemaining');
    if (curTotal) curTotal.textContent = symbol;
    if (curPaid) curPaid.textContent = symbol;
    if (curRemaining) curRemaining.textContent = symbol;
}

function renderProgress() {
    const stats = getGlobalStats();
    const percent = stats.progress;
    const circumference = 2 * Math.PI * 42;
    const offset = circumference - (percent / 100) * circumference;

    const circle = document.getElementById('progressCircle');
    if (circle) {
        circle.style.strokeDashoffset = offset;
    }

    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('progressPaid').textContent = formatCurrency(stats.totalPaid);
    document.getElementById('progressRemaining').textContent = formatCurrency(stats.totalRemaining);
}

function renderChart() {
    const ctx = document.getElementById('collectionChart');
    if (!ctx) return;
    if (typeof Chart === 'undefined') return;

    const stats = getGlobalStats();
    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success').trim();
    const warningColor = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim();
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();

    if (APP.chart) {
        APP.chart.data.datasets[0].data = [stats.totalPaid, stats.totalRemaining];
        APP.chart.update('none');
        return;
    }

    APP.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['المسددة', 'المتبقية'],
            datasets: [{
                data: [stats.totalPaid, stats.totalRemaining],
                backgroundColor: [successColor, warningColor],
                borderWidth: 0,
                cutout: '70%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: {
                    position: 'bottom',
                    rtl: true,
                    labels: {
                        font: { family: 'Segoe UI, Tahoma, Arial', size: 13, weight: '600' },
                        color: textColor,
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    rtl: true,
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + formatCurrency(context.raw) + ' ' + getDefaultCurrencySymbol();
                        }
                    }
                }
            }
        }
    });
}

function renderDebtors() {
    const grid = document.getElementById('debtorsGrid');
    const emptyState = document.getElementById('emptyState');
    const searchTerm = (document.getElementById('searchInput').value || '').trim().toLowerCase();

    const minAmount = parseFloat(document.getElementById('filterMinAmount')?.value) || 0;
    const maxAmount = parseFloat(document.getElementById('filterMaxAmount')?.value) || Infinity;
    const categoryFilter = document.getElementById('filterCategory')?.value || 'all';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    const sortValue = document.getElementById('sortSelect')?.value || 'newest';
    const today = getTodayDate();
    const todayTime = new Date(today).getTime();
    const reminderDays = APP.settings.reminderDays || 7;
    const totalsMap = {};
    const trustMap = {};
    const filtered = [];

    for (let i = 0; i < APP.debtors.length; i++) {
        const debtor = APP.debtors[i];
        if (debtor.archived) continue;

        const totals = getDebtorTotals(debtor);
        totalsMap[debtor.id] = totals;
        trustMap[debtor.id] = calculateTrustScore(debtor, totals);

        if (searchTerm) {
            const name = debtor.name || '';
            const phone = debtor.phone || '';
            const email = debtor.email || '';
            const notes = debtor.notes || '';
            if (!name.toLowerCase().includes(searchTerm) &&
                !phone.includes(searchTerm) &&
                !email.toLowerCase().includes(searchTerm) &&
                !notes.toLowerCase().includes(searchTerm)) continue;
        }

        if (totals.remaining < minAmount) continue;
        if (totals.remaining > maxAmount) continue;
        if (categoryFilter !== 'all' && debtor.category !== categoryFilter) continue;

        if (dateFrom || dateTo) {
            const transactions = debtor.transactions;
            let hasDateRange = false;
            for (let k = 0; k < transactions.length; k++) {
                const t = transactions[k];
                if (t.type !== 'debt') continue;
                if (dateFrom && t.date < dateFrom) continue;
                if (dateTo && t.date > dateTo) continue;
                hasDateRange = true;
                break;
            }
            if (!hasDateRange) continue;
        }

        const hasOverdue = totals.overdueCount > 0;
        const isPaid = totals.remaining <= 0 && totals.total > 0;
        const isActive = totals.remaining > 0;

        switch (APP.currentFilter) {
            case 'active':
                if (!(isActive && !hasOverdue)) continue;
                break;
            case 'overdue':
                if (!hasOverdue) continue;
                break;
            case 'paid':
                if (!isPaid) continue;
                break;
            case 'due-soon': {
                if (!isActive) continue;
                const paymentsByDebt = getPaymentTotalsByDebt(debtor);
                let isDueSoon = false;
                const transactions = debtor.transactions;
                for (let k = 0; k < transactions.length; k++) {
                    const t = transactions[k];
                    if (t.type !== 'debt' || !t.dueDate) continue;
                    if (t.amount - (paymentsByDebt[t.id] || 0) <= 0) continue;
                    const diff = (new Date(t.dueDate).getTime() - todayTime) / 86400000;
                    if (diff >= 0 && diff <= reminderDays) { isDueSoon = true; break; }
                }
                if (!isDueSoon) continue;
                break;
            }
        }
        filtered.push(debtor);
    }

    filtered.sort(function(a, b) {
        const ta = totalsMap[a.id];
        const tb = totalsMap[b.id];
        switch (sortValue) {
            case 'oldest': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'name-asc': return a.name.localeCompare(b.name, 'ar');
            case 'name-desc': return b.name.localeCompare(a.name, 'ar');
            case 'amount-desc': return tb.total - ta.total;
            case 'amount-asc': return ta.total - tb.total;
            case 'remaining-desc': return tb.remaining - ta.remaining;
            case 'remaining-asc': return ta.remaining - tb.remaining;
            case 'trust-desc': return trustMap[b.id] - trustMap[a.id];
            case 'trust-asc': return trustMap[a.id] - trustMap[b.id];
            default: return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    if (filtered.length === 0) {
        grid.innerHTML = '';
        emptyState.hidden = false;
        if (APP.debtors.some(function(d) { return !d.archived; })) {
            emptyState.querySelector('h3').textContent = 'لا توجد نتائج';
            emptyState.querySelector('p').textContent = 'جرب تغيير البحث أو الفلتر';
        } else {
            emptyState.querySelector('h3').textContent = 'لا يوجد مديونون حتى الآن';
            emptyState.querySelector('p').textContent = 'ابدأ بإضافة مديون جديد لتتبع الديون المستحقة لك';
        }
        return;
    }

    emptyState.hidden = true;
    grid.innerHTML = '';

    const categoryLabels = { general: 'عام', family: 'عائلة', friend: 'صديق', customer: 'عميل', supplier: 'مورد', employee: 'موظف', other: 'آخر' };
    const fragment = document.createDocumentFragment();

    for (let idx = 0; idx < filtered.length; idx++) {
        const debtor = filtered[idx];
        const totals = totalsMap[debtor.id];
        const trustScore = trustMap[debtor.id];
        const hasOverdue = totals.overdueCount > 0;
        const isPaid = totals.remaining <= 0 && totals.total > 0;

        let statusClass = 'status-active';
        let statusText = 'دين قائم';
        if (hasOverdue) {
            statusClass = 'status-overdue';
            statusText = 'متأخر';
        } else if (isPaid) {
            statusClass = 'status-paid';
            statusText = 'مسدد';
        }

        const trustColor = trustScore >= 75 ? 'trust-high' : trustScore >= 50 ? 'trust-medium' : 'trust-low';
        const whatsappDisabled = (!debtor.phone || totals.remaining <= 0);
        const disabledStyle = whatsappDisabled ? ' style="opacity:0.5;cursor:not-allowed"' : '';
        const isSelected = APP.selectedDebtorIds.has(debtor.id);
        const selectedStyle = isSelected ? ' debtor-selected' : '';

        const card = document.createElement('div');
        card.className = 'debtor-card' + selectedStyle;
        card.dataset.debtorId = debtor.id;

        const badges = [];
        if (totals.overdueCount > 0) badges.push('<span class="badge badge-danger"><i data-lucide="alert-triangle"></i> ' + totals.overdueCount + ' متأخر</span>');
        if (totals.promisesCount > 0) badges.push('<span class="badge badge-warning"><i data-lucide="handshake"></i> ' + totals.promisesCount + ' وعد</span>');
        if (totals.checksTotal > 0) badges.push('<span class="badge badge-info"><i data-lucide="credit-card"></i> شيك</span>');
        if ((debtor.installments || []).some(function(i) { return i.status === 'active'; })) badges.push('<span class="badge badge-primary"><i data-lucide="calendar"></i> أقساط</span>');
        if (totals.interest > 0) badges.push('<span class="badge badge-warning"><i data-lucide="percent"></i> فائدة</span>');

        const categoryLabel = categoryLabels[debtor.category] || 'عام';

        card.innerHTML =
            '<input type="checkbox" class="debtor-select-checkbox" data-id="' + debtor.id + '"' + (isSelected ? ' checked' : '') + '>' +
            '<span class="debtor-status ' + statusClass + '">' + statusText + '</span>' +
            '<div class="debtor-card-header">' +
                '<div class="debtor-avatar">' + getInitials(debtor.name) + '</div>' +
                '<div class="debtor-info">' +
                    '<div class="debtor-name">' + escapeHtml(debtor.name) + '</div>' +
                    '<div class="debtor-phone">' +
                        '<i data-lucide="phone"></i>' +
                        (debtor.phone ? escapeHtml(debtor.phone) : 'لا يوجد رقم') +
                    '</div>' +
                    '<div class="debtor-meta">' +
                        '<span class="debtor-category"><i data-lucide="tag"></i> ' + categoryLabel + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="trust-badge ' + trustColor + '" title="درجة الثقة">' +
                    '<i data-lucide="shield-check"></i> ' + trustScore +
                '</div>' +
            '</div>' +
            (badges.length > 0 ? '<div class="debtor-badges">' + badges.join('') + '</div>' : '') +
            '<div class="debtor-amounts">' +
                '<div class="amount-item amount-paid">' +
                    '<small>المسددة</small>' +
                    '<strong>' + formatCurrency(totals.paid) + '</strong>' +
                '</div>' +
                '<div class="amount-item amount-remaining">' +
                    '<small>المتبقية</small>' +
                    '<strong>' + formatCurrency(totals.remaining) + '</strong>' +
                '</div>' +
            '</div>' +
            (totals.interest > 0 ? '<div class="interest-note"><i data-lucide="percent"></i> فائدة تأخير: ' + formatCurrency(totals.interest) + '</div>' : '') +
            '<div class="debtor-progress">' +
                '<div class="debtor-progress-fill" style="width: ' + totals.progress + '%"></div>' +
            '</div>' +
            '<div class="debtor-actions">' +
                '<button class="btn-primary btn-sm" data-action="details" data-id="' + debtor.id + '">' +
                    '<i data-lucide="eye"></i> تفاصيل' +
                '</button>' +
                '<button class="btn-whatsapp btn-sm" data-action="whatsapp" data-id="' + debtor.id + '"' + disabledStyle + '>' +
                    '<i data-lucide="message-circle"></i> تذكير' +
                '</button>' +
            '</div>';

        fragment.appendChild(card);
    }

    grid.innerHTML = '';
    grid.appendChild(fragment);

    updateBulkActions();
    safeCreateIcons();
}

function updateBulkActions() {
    const toolbar = document.getElementById('bulkActionsToolbar');
    if (!toolbar) return;
    const count = APP.selectedDebtorIds.size;
    toolbar.hidden = count === 0;
    document.getElementById('bulkCount').textContent = count;
}

function toggleDebtorSelection(id) {
    if (APP.selectedDebtorIds.has(id)) APP.selectedDebtorIds.delete(id);
    else APP.selectedDebtorIds.add(id);
    renderDebtors();
}

function clearSelection() {
    APP.selectedDebtorIds.clear();
    renderDebtors();
}

function bulkWhatsApp() {
    if (APP.selectedDebtorIds.size === 0) return;
    const debtors = APP.debtors.filter(function(d) { return APP.selectedDebtorIds.has(d.id); });
    debtors.forEach(function(d) { sendWhatsAppReminder(d.id); });
    clearSelection();
}

function bulkArchive() {
    if (APP.selectedDebtorIds.size === 0) return;
    showConfirm('أرشفة ' + APP.selectedDebtorIds.size + ' مديون؟', function() {
        APP.selectedDebtorIds.forEach(function(id) {
            const d = APP.debtors.find(function(x) { return x.id === id; });
            if (d) d.archived = true;
        });
        saveData();
        renderAll();
        clearSelection();
        showToast('تم الأرشفة', 'success');
    });
}

function bulkExport() {
    const debtors = APP.debtors.filter(function(d) { return APP.selectedDebtorIds.has(d.id); });
    if (debtors.length === 0) return;
    const blob = new Blob([JSON.stringify({ debtors: debtors }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'debtors-selected-' + getTodayDate() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير ' + debtors.length + ' مديون', 'success');
}

function showDebtorDetails(debtorId) {
    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    APP.currentDebtorId = debtorId;
    renderDebtorDetails(debtor);
    openModal('debtorDetailsModal');
    safeCreateIcons();
}

function renderDebtorDetails(debtor) {
    const totals = getDebtorTotals(debtor);
    const trustScore = calculateTrustScore(debtor);
    const trustLabel = trustScore >= 75 ? 'موثوق' : trustScore >= 50 ? 'متوسط' : 'منخفض';

    document.getElementById('detailsDebtorName').textContent = debtor.name;
    document.getElementById('detailsDebtorPhone').textContent = debtor.phone || 'لا يوجد رقم';
    const emailEl = document.getElementById('detailsDebtorEmail');
    if (emailEl) emailEl.textContent = debtor.email || '-';
    const catEl = document.getElementById('detailsDebtorCategory');
    if (catEl) catEl.textContent = { general: 'عام', family: 'عائلة', friend: 'صديق', customer: 'عميل', supplier: 'مورد', employee: 'موظف', other: 'آخر' }[debtor.category] || 'عام';
    document.getElementById('detailsDebtorNotes').textContent = debtor.notes || 'لا توجد ملاحظات';
    document.getElementById('detailsTotal').textContent = formatCurrency(totals.total);
    document.getElementById('detailsPaid').textContent = formatCurrency(totals.paid);
    document.getElementById('detailsRemaining').textContent = formatCurrency(totals.remaining);

    const trustEl = document.getElementById('detailsTrustScore');
    if (trustEl) {
        trustEl.textContent = trustScore + '% - ' + trustLabel;
        trustEl.className = 'trust-badge ' + (trustScore >= 75 ? 'trust-high' : trustScore >= 50 ? 'trust-medium' : 'trust-low');
    }

    const overdueEl = document.getElementById('detailsOverdue');
    if (overdueEl) overdueEl.textContent = formatCurrency(totals.overdueAmount);

    const interestEl = document.getElementById('detailsInterest');
    if (interestEl) interestEl.textContent = formatCurrency(totals.interest);

    document.getElementById('addDebtBtn').onclick = function() { openDebtModal(debtor.id); };
    document.getElementById('whatsappReminderBtn').onclick = function() { sendWhatsAppReminder(debtor.id); };
    document.getElementById('printStatementBtn').onclick = function() { printStatement(debtor.id); };
    document.getElementById('deleteDebtorBtn').onclick = function() { deleteDebtor(debtor.id); };

    document.getElementById('addInstallmentBtn').onclick = function() {
        document.getElementById('installmentDebtorId').value = debtor.id;
        document.getElementById('installmentStartDate').value = getTodayDate();
        openModal('installmentModal');
    };
    document.getElementById('addCheckBtn').onclick = function() {
        document.getElementById('checkDebtorId').value = debtor.id;
        document.getElementById('checkDueDate').value = getTodayDate();
        openModal('checkModal');
    };
    document.getElementById('addPromiseBtn').onclick = function() {
        document.getElementById('promiseDebtorId').value = debtor.id;
        document.getElementById('promiseDate').value = getTodayDate();
        openModal('promiseModal');
    };
    document.getElementById('logCallBtn').onclick = function() { openCallLogModal(debtor.id); };
    document.getElementById('addCallLogBtn').onclick = function() { openCallLogModal(debtor.id); };

    renderTransactions(debtor);
    renderInstallments(debtor);
    renderChecks(debtor);
    renderPromises(debtor);
    renderCallLogs();
    renderAttachments(debtor);
    safeCreateIcons();
}

function renderInstallments(debtor) {
    const container = document.getElementById('installmentsList');
    if (!container) return;
    const installments = debtor.installments || [];

    if (installments.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><i data-lucide="calendar"></i><p>لا توجد خطط أقساط</p></div>';
        return;
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const today = getTodayDate();

    for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        let paidCount = 0, overdueCount = 0;
        for (let j = 0; j < inst.schedule.length; j++) {
            const s = inst.schedule[j];
            if (s.status === 'paid') paidCount++;
            else if (s.dueDate < today) overdueCount++;
        }
        const progress = (paidCount / inst.totalInstallments) * 100;

        const wrap = document.createElement('div');
        wrap.className = 'installment-card ' + (inst.status === 'completed' ? 'completed' : overdueCount > 0 ? 'overdue' : '');

        let scheduleHtml = '';
        for (let k = 0; k < inst.schedule.length; k++) {
            const s = inst.schedule[k];
            const isPaid = s.status === 'paid';
            const isOverdue = !isPaid && s.dueDate < today;
            scheduleHtml += '<div class="installment-row ' + (isPaid ? 'paid' : isOverdue ? 'overdue' : '') + '">' +
                '<span class="installment-num">' + s.number + '</span>' +
                '<span class="installment-date">' + formatDate(s.dueDate) + '</span>' +
                '<span class="installment-amount">' + formatCurrency(s.amount) + '</span>' +
                (isPaid
                    ? '<span class="installment-status success"><i data-lucide="check"></i> مدفوع</span>'
                    : '<button class="btn-success btn-xs" data-action="pay-installment" data-inst="' + inst.id + '" data-sched="' + s.id + '" aria-label="دفع القسط"><i data-lucide="check"></i> دفع</button>') +
                '</div>';
        }

        wrap.innerHTML =
            '<div class="installment-header">' +
                '<div>' +
                    '<strong>' + escapeHtml(inst.description) + '</strong>' +
                    '<small>' + paidCount + ' / ' + inst.totalInstallments + ' - ' + formatCurrency(inst.totalAmount) + '</small>' +
                '</div>' +
                (inst.status === 'completed' ? '<span class="badge badge-success">مكتمل</span>' : overdueCount > 0 ? '<span class="badge badge-danger">' + overdueCount + ' متأخر</span>' : '<span class="badge badge-primary">جاري</span>') +
            '</div>' +
            '<div class="installment-progress"><div class="installment-progress-fill" style="width:' + progress + '%"></div></div>' +
            '<div class="installment-schedule">' + scheduleHtml + '</div>';

        fragment.appendChild(wrap);
    }
    container.appendChild(fragment);
}

function renderChecks(debtor) {
    const container = document.getElementById('checksList');
    if (!container) return;
    const checks = debtor.checks || [];

    if (checks.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><i data-lucide="credit-card"></i><p>لا توجد شيكات</p></div>';
        return;
    }

    container.innerHTML = '';
    const statusLabels = { pending: 'معلق', cashed: 'مُحصل', bounced: 'مرتجع', cancelled: 'ملغي' };
    const fragment = document.createDocumentFragment();
    const today = getTodayDate();

    const sorted = checks.slice().sort(function(a, b) { return b.dueDate < a.dueDate ? -1 : b.dueDate > a.dueDate ? 1 : 0; });
    for (let i = 0; i < sorted.length; i++) {
        const check = sorted[i];
        const wrap = document.createElement('div');
        wrap.className = 'check-card status-' + check.status;
        const overdue = check.status === 'pending' && check.dueDate < today;

        let actions = '';
        if (check.status === 'pending') {
            actions = '<button class="btn-success btn-xs" data-action="cash-check" data-check="' + check.id + '" aria-label="تم التحصيل"><i data-lucide="check"></i> تم التحصيل</button>' +
                      '<button class="btn-danger btn-xs" data-action="bounce-check" data-check="' + check.id + '" aria-label="ارتجاع"><i data-lucide="x"></i> ارتجاع</button>';
        }

        wrap.innerHTML =
            '<div class="check-icon"><i data-lucide="' + (check.status === 'cashed' ? 'check-circle' : check.status === 'bounced' ? 'x-circle' : 'credit-card') + '"></i></div>' +
            '<div class="check-info">' +
                '<strong>شيك رقم: ' + escapeHtml(check.checkNumber || '-') + '</strong>' +
                '<small>' + (check.bankName ? escapeHtml(check.bankName) + ' - ' : '') + formatDate(check.dueDate) + (overdue ? ' (متأخر)' : '') + '</small>' +
                (check.notes ? '<small>' + escapeHtml(check.notes) + '</small>' : '') +
            '</div>' +
            '<div class="check-amount">' +
                '<strong>' + formatCurrency(check.amount) + '</strong>' +
                '<span class="check-status status-' + check.status + '">' + statusLabels[check.status] + '</span>' +
            '</div>' +
            '<div class="check-actions">' + actions + '</div>';

        fragment.appendChild(wrap);
    }
    container.appendChild(fragment);
}

function renderPromises(debtor) {
    const container = document.getElementById('promisesList');
    if (!container) return;
    const promises = debtor.promises || [];

    if (promises.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><i data-lucide="handshake"></i><p>لا توجد وعود</p></div>';
        return;
    }

    container.innerHTML = '';
    const statusLabels = { pending: 'قيد الانتظار', kept: 'مُنجز', broken: 'مكسور' };
    const fragment = document.createDocumentFragment();
    const today = getTodayDate();

    const sorted = promises.slice().sort(function(a, b) { return b.promiseDate < a.promiseDate ? -1 : b.promiseDate > a.promiseDate ? 1 : 0; });
    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const wrap = document.createElement('div');
        wrap.className = 'promise-card status-' + p.status;
        const overdue = p.status === 'pending' && p.promiseDate < today;

        let actions = '';
        if (p.status === 'pending') {
            actions = '<button class="btn-success btn-xs" data-action="keep-promise" data-promise="' + p.id + '" aria-label="تم الوفاء"><i data-lucide="check"></i> تم</button>' +
                      '<button class="btn-danger btn-xs" data-action="break-promise" data-promise="' + p.id + '" aria-label="لم يلتزم"><i data-lucide="x"></i> لم يلتزم</button>';
        }

        wrap.innerHTML =
            '<div class="promise-icon"><i data-lucide="handshake"></i></div>' +
            '<div class="promise-info">' +
                '<strong>وعد سداد</strong>' +
                '<small>' + formatDate(p.promiseDate) + (overdue ? ' (متأخر)' : '') + '</small>' +
                (p.notes ? '<small>' + escapeHtml(p.notes) + '</small>' : '') +
            '</div>' +
            '<div class="promise-amount">' +
                '<strong>' + formatCurrency(p.amount) + '</strong>' +
                '<span class="promise-status status-' + p.status + '">' + statusLabels[p.status] + '</span>' +
            '</div>' +
            '<div class="promise-actions">' + actions + '</div>';

        fragment.appendChild(wrap);
    }
    container.appendChild(fragment);
}

function renderAttachments(debtor) {
    const container = document.getElementById('attachmentsList');
    if (!container) return;
    const attachments = debtor.attachments || [];

    if (attachments.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><i data-lucide="paperclip"></i><p>لا توجد مرفقات</p></div>';
        return;
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const wrap = document.createElement('div');
        wrap.className = 'attachment-card';
        const isImage = att.type && att.type.startsWith('image/');
        const sizeKB = (att.size / 1024).toFixed(1);

        wrap.innerHTML =
            '<div class="attachment-icon"><i data-lucide="' + (isImage ? 'image' : 'file-text') + '"></i></div>' +
            '<div class="attachment-info">' +
                '<strong title="' + escapeHtml(att.name) + '">' + escapeHtml(att.name.length > 25 ? att.name.substring(0, 25) + '...' : att.name) + '</strong>' +
                '<small>' + sizeKB + ' KB - ' + new Date(att.uploadedAt).toLocaleDateString('ar-EG') + '</small>' +
            '</div>' +
            (isImage ? '<a href="' + att.data + '" target="_blank" class="btn-info btn-xs" aria-label="عرض المرفق"><i data-lucide="eye"></i></a>' : '') +
            '<a href="' + att.data + '" download="' + escapeHtml(att.name) + '" class="btn-secondary btn-xs" aria-label="تحميل المرفق"><i data-lucide="download"></i></a>' +
            '<button class="btn-danger btn-xs" data-action="delete-attachment" data-att="' + att.id + '" aria-label="حذف المرفق"><i data-lucide="trash-2"></i></button>';

        fragment.appendChild(wrap);
    }
    container.appendChild(fragment);
}

// ==================== التحليلات المتقدمة ====================

function renderAnalytics() {
    const grid = document.getElementById('monthlyChart');
    if (!grid || typeof Chart === 'undefined') return;

    const months = [];
    const monthData = { debt: [], payment: [] };
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    for (let i = 11; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        months.push(d.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' }));
        monthData.debt.push(0);
        monthData.payment.push(0);
    }

    for (let i = 0; i < APP.debtors.length; i++) {
        const transactions = APP.debtors[i].transactions;
        for (let j = 0; j < transactions.length; j++) {
            const t = transactions[j];
            const td = new Date(t.date);
            const monthsDiff = (currentYear - td.getFullYear()) * 12 + (currentMonth - td.getMonth());
            if (monthsDiff >= 0 && monthsDiff < 12) {
                const idx = 11 - monthsDiff;
                if (t.type === 'debt') monthData.debt[idx] += t.amount;
                else if (t.type === 'payment') monthData.payment[idx] += t.amount;
            }
        }
    }

    if (APP.monthlyChart) {
        APP.monthlyChart.data.labels = months;
        APP.monthlyChart.data.datasets[0].data = monthData.debt;
        APP.monthlyChart.data.datasets[1].data = monthData.payment;
        APP.monthlyChart.update('none');
        return;
    }
    APP.monthlyChart = new Chart(grid, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'الديون الجديدة', data: monthData.debt, backgroundColor: '#ef4444', borderRadius: 8 },
                { label: 'التحصيلات', data: monthData.payment, backgroundColor: '#10b981', borderRadius: 8 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: { legend: { position: 'bottom', rtl: true, labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() } } },
            scales: {
                y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() } },
                x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() } }
            }
        }
    });

    renderDebtorsChart();
    renderTimelineChart();
    renderTopDebtors();
    renderUpcomingList();
    renderKPIs();
}

function renderDebtorsChart() {
    const ctx = document.getElementById('debtorsChart');
    if (!ctx) return;

    const categories = { general: 0, family: 0, friend: 0, customer: 0, supplier: 0, employee: 0, other: 0 };
    APP.debtors.forEach(function(d) {
        const t = getDebtorTotals(d);
        const cat = d.category || 'general';
        categories[cat] = (categories[cat] || 0) + t.remaining;
    });

    const data = Object.values(categories);
    if (APP.debtorsChart) {
        APP.debtorsChart.data.datasets[0].data = data;
        APP.debtorsChart.update('none');
        return;
    }
    APP.debtorsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['عام', 'عائلة', 'صديق', 'عميل', 'مورد', 'موظف', 'آخر'],
            datasets: [{
                data: data,
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: { legend: { position: 'bottom', rtl: true } }
        }
    });
}

function renderTimelineChart() {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    const cumulativeDebt = [];
    const cumulativePaid = [];
    let runningD = 0, runningP = 0;
    const events = [];

    for (let i = 0; i < APP.debtors.length; i++) {
        const transactions = APP.debtors[i].transactions;
        for (let j = 0; j < transactions.length; j++) {
            const t = transactions[j];
            events.push({ date: t.date, type: t.type, amount: t.amount });
        }
    }
    events.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    const labels = [];
    const monthMap = {};
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const key = e.date.substring(0, 7);
        if (!monthMap[key]) {
            monthMap[key] = { debt: 0, payment: 0 };
            labels.push(key);
        }
        if (e.type === 'debt') monthMap[key].debt += e.amount;
        else monthMap[key].payment += e.amount;
    }

    for (let i = 0; i < labels.length; i++) {
        runningD += monthMap[labels[i]].debt;
        runningP += monthMap[labels[i]].payment;
        cumulativeDebt.push(runningD);
        cumulativePaid.push(runningP);
    }

    const formattedLabels = labels.map(function(l) {
        const d = new Date(l + '-01');
        return d.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' });
    });

    if (APP.timelineChart) {
        APP.timelineChart.data.labels = formattedLabels;
        APP.timelineChart.data.datasets[0].data = cumulativeDebt;
        APP.timelineChart.data.datasets[1].data = cumulativePaid;
        APP.timelineChart.update('none');
        return;
    }

    APP.timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [
                { label: 'إجمالي الديون', data: cumulativeDebt, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 },
                { label: 'إجمالي التحصيل', data: cumulativePaid, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: { legend: { position: 'bottom', rtl: true } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderTopDebtors() {
    const list = document.getElementById('topDebtorsList');
    if (!list) return;

    const sorted = APP.debtors.slice().sort(function(a, b) {
        return getDebtorTotals(b).remaining - getDebtorTotals(a).remaining;
    }).slice(0, 5);

    if (sorted.length === 0) {
        list.innerHTML = '<div class="empty-state-small"><i data-lucide="users"></i><p>لا يوجد بيانات</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < sorted.length; i++) {
        const d = sorted[i];
        const t = getDebtorTotals(d);
        const item = document.createElement('div');
        item.className = 'top-item';
        item.innerHTML =
            '<div class="top-rank">' + (i + 1) + '</div>' +
            '<div class="top-info">' +
                '<div class="top-name">' + escapeHtml(d.name) + '</div>' +
                '<div class="top-amount">' + formatCurrency(t.remaining) + '</div>' +
            '</div>';
        fragment.appendChild(item);
    }
    list.innerHTML = '';
    list.appendChild(fragment);
}

function renderUpcomingList() {
    const list = document.getElementById('upcomingList');
    if (!list) return;

    const today = getTodayDate();
    const todayTime = new Date(today).getTime();
    const upcoming = [];
    const reminderWindow = APP.settings.reminderDays + 7;

    for (let i = 0; i < APP.debtors.length; i++) {
        const d = APP.debtors[i];
        const transactions = d.transactions;
        for (let j = 0; j < transactions.length; j++) {
            const t = transactions[j];
            if (t.type !== 'debt' || !t.dueDate) continue;
            let dp = 0;
            for (let k = 0; k < transactions.length; k++) {
                const p = transactions[k];
                if (p.type === 'payment' && p.debtId === t.id) dp += p.amount;
            }
            const remaining = t.amount - dp;
            if (remaining <= 0) continue;
            const days = Math.floor((new Date(t.dueDate).getTime() - todayTime) / 86400000);
            if (days <= reminderWindow) {
                upcoming.push({ debtor: d, debt: t, days: days, remaining: remaining });
            }
        }
    }

    upcoming.sort(function(a, b) { return a.days - b.days; });

    if (upcoming.length === 0) {
        list.innerHTML = '<div class="empty-state-small"><i data-lucide="calendar"></i><p>لا توجد استحقاقات قادمة</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    const top5 = upcoming.slice(0, 5);
    for (let i = 0; i < top5.length; i++) {
        const u = top5[i];
        const item = document.createElement('div');
        const urgent = u.days < 0;
        item.className = 'upcoming-item ' + (urgent ? 'urgent' : '');
        item.innerHTML =
            '<div class="upcoming-icon"><i data-lucide="' + (urgent ? 'alert-triangle' : 'clock') + '"></i></div>' +
            '<div class="upcoming-info">' +
                '<div class="upcoming-name">' + escapeHtml(u.debtor.name) + '</div>' +
                '<div class="upcoming-desc">' + escapeHtml(u.debt.description) + '</div>' +
            '</div>' +
            '<div class="upcoming-meta">' +
                '<strong>' + formatCurrency(u.remaining) + '</strong>' +
                '<small>' + (urgent ? Math.abs(u.days) + ' يوم تأخير' : 'بعد ' + u.days + ' يوم') + '</small>' +
            '</div>';
        fragment.appendChild(item);
    }
    list.innerHTML = '';
    list.appendChild(fragment);
}

function renderKPIs() {
    const grid = document.getElementById('kpiGrid');
    if (!grid) return;

    const stats = getGlobalStats();
    const collectionRate = stats.totalRequired > 0 ? (stats.totalPaid / stats.totalRequired) * 100 : 0;
    const avgDebt = stats.totalDebtors > 0 ? stats.totalRemaining / stats.totalDebtors : 0;

    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    let currentMonthCollection = 0;
    let lastMonthCollection = 0;
    for (let i = 0; i < APP.debtors.length; i++) {
        const transactions = APP.debtors[i].transactions;
        for (let j = 0; j < transactions.length; j++) {
            const t = transactions[j];
            if (t.type !== 'payment') continue;
            const m = t.date.substring(0, 7);
            if (m === currentMonthStr) currentMonthCollection += t.amount;
            else if (m === lastMonthStr) lastMonthCollection += t.amount;
        }
    }

    const growth = lastMonthCollection > 0 ? ((currentMonthCollection - lastMonthCollection) / lastMonthCollection) * 100 : 0;

    grid.innerHTML =
        '<div class="kpi-item"><div class="kpi-label">نسبة التحصيل</div><div class="kpi-value">' + Math.round(collectionRate) + '%</div><div class="kpi-trend">' + formatCurrency(stats.totalPaid) + ' محصل</div></div>' +
        '<div class="kpi-item"><div class="kpi-label">متوسط الدين</div><div class="kpi-value">' + formatCurrency(avgDebt) + '</div><div class="kpi-trend">لـ ' + stats.totalDebtors + ' مديون</div></div>' +
        '<div class="kpi-item"><div class="kpi-label">تحصيل الشهر</div><div class="kpi-value">' + formatCurrency(currentMonthCollection) + '</div><div class="kpi-trend ' + (growth >= 0 ? 'text-success' : 'text-danger') + '">' + (growth >= 0 ? '↑' : '↓') + ' ' + Math.abs(Math.round(growth)) + '%</div></div>' +
        '<div class="kpi-item"><div class="kpi-label">ديون متأخرة</div><div class="kpi-value text-danger">' + formatCurrency(stats.totalOverdueAmount) + '</div><div class="kpi-trend">' + stats.overdueCount + ' دين</div></div>' +
        '<div class="kpi-item"><div class="kpi-label">شيكات معلقة</div><div class="kpi-value">' + formatCurrency(stats.totalChecks) + '</div><div class="kpi-trend">' + stats.totalChecksCount + ' شيك</div></div>' +
        '<div class="kpi-item"><div class="kpi-label">أقساط نشطة</div><div class="kpi-value">' + formatCurrency(stats.totalInstallments) + '</div><div class="kpi-trend">' + stats.activeInstallments + ' خطة</div></div>';
}

function getGlobalStats() {
    let totalRequired = 0;
    let totalPaid = 0;
    let activeDebtors = 0;
    let overdueCount = 0;
    let totalOverdueAmount = 0;
    let totalChecks = 0;
    let totalChecksCount = 0;
    let totalInstallments = 0;
    let activeInstallments = 0;

    for (let i = 0; i < APP.debtors.length; i++) {
        const debtor = APP.debtors[i];
        const totals = getDebtorTotals(debtor);
        totalRequired += totals.total;
        totalPaid += totals.paid;
        overdueCount += totals.overdueCount;
        totalOverdueAmount += totals.overdueAmount;

        if (totals.remaining > 0) activeDebtors++;

        const checks = debtor.checks;
        if (checks) {
            for (let j = 0; j < checks.length; j++) {
                if (checks[j].status === 'pending') {
                    totalChecks += checks[j].amount;
                    totalChecksCount++;
                }
            }
        }

        const installments = debtor.installments;
        if (installments) {
            for (let j = 0; j < installments.length; j++) {
                if (installments[j].status === 'active') {
                    const sched = installments[j].schedule;
                    let rem = 0;
                    for (let k = 0; k < sched.length; k++) {
                        if (sched[k].status === 'pending') rem += sched[k].amount;
                    }
                    totalInstallments += rem;
                    activeInstallments++;
                }
            }
        }
    }

    return {
        totalRequired: totalRequired,
        totalPaid: totalPaid,
        totalRemaining: totalRequired - totalPaid,
        totalDebtors: APP.debtors.length,
        activeDebtors: activeDebtors,
        overdueCount: overdueCount,
        totalOverdueAmount: totalOverdueAmount,
        totalChecks: totalChecks,
        totalChecksCount: totalChecksCount,
        totalInstallments: totalInstallments,
        activeInstallments: activeInstallments,
        progress: totalRequired > 0 ? Math.round((totalPaid / totalRequired) * 100) : 0
    };
}

// ==================== التقويم ====================

// ==================== سجل النشاط ====================

function renderActivityLog() {
    const list = document.getElementById('activityLogList');
    if (!list) return;

    const iconMap = {
        debtor_added: 'user-plus',
        debtor_updated: 'edit',
        debt_added: 'plus-circle',
        payment_added: 'check-circle',
        installment_created: 'calendar',
        installment_paid: 'check',
        check_added: 'credit-card',
        promise_added: 'handshake'
    };

    if (APP.activityLog.length === 0) {
        list.innerHTML = '<div class="empty-state-small"><i data-lucide="activity"></i><p>لا يوجد نشاط مسجل</p></div>';
        return;
    }

    list.innerHTML = '';
    APP.activityLog.slice(0, 50).forEach(function(entry) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        item.innerHTML =
            '<div class="activity-icon"><i data-lucide="' + (iconMap[entry.type] || 'activity') + '"></i></div>' +
            '<div class="activity-info"><div class="activity-desc">' + escapeHtml(entry.description) + '</div><div class="activity-time">' + timeStr + '</div></div>';
        list.appendChild(item);
    });
    safeCreateIcons();
}

// ==================== مقارنة الفترات ====================

function renderPeriodComparison() {
    const container = document.getElementById('periodComparison');
    if (!container) return;

    const today = new Date();
    const currentMonth = today.toISOString().substring(0, 7);
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.toISOString().substring(0, 7);

    function getMonthData(month) {
        let debt = 0, paid = 0, count = 0;
        for (let i = 0; i < APP.debtors.length; i++) {
            const transactions = APP.debtors[i].transactions;
            for (let j = 0; j < transactions.length; j++) {
                const t = transactions[j];
                if (t.date.substring(0, 7) !== month) continue;
                if (t.type === 'debt') debt += t.amount;
                else paid += t.amount;
                count++;
            }
        }
        return { debt: debt, paid: paid, count: count };
    }

    const curr = getMonthData(currentMonth);
    const prev = getMonthData(lastMonth);
    const debtChange = prev.debt > 0 ? ((curr.debt - prev.debt) / prev.debt) * 100 : 0;
    const paidChange = prev.paid > 0 ? ((curr.paid - prev.paid) / prev.paid) * 100 : 0;

    container.innerHTML =
        '<div class="comparison-grid">' +
        '<div class="comparison-col"><h4>الشهر الحالي</h4>' +
            '<div class="comparison-row"><span>ديون جديدة</span><strong>' + formatCurrency(curr.debt) + '</strong></div>' +
            '<div class="comparison-row"><span>تحصيلات</span><strong class="text-success">' + formatCurrency(curr.paid) + '</strong></div>' +
            '<div class="comparison-row"><span>عمليات</span><strong>' + curr.count + '</strong></div>' +
        '</div>' +
        '<div class="comparison-col"><h4>الشهر السابق</h4>' +
            '<div class="comparison-row"><span>ديون جديدة</span><strong>' + formatCurrency(prev.debt) + '</strong></div>' +
            '<div class="comparison-row"><span>تحصيلات</span><strong class="text-success">' + formatCurrency(prev.paid) + '</strong></div>' +
            '<div class="comparison-row"><span>عمليات</span><strong>' + prev.count + '</strong></div>' +
        '</div>' +
        '</div>' +
        '<div class="comparison-trends">' +
        '<div class="trend ' + (debtChange <= 0 ? 'text-success' : 'text-danger') + '"><i data-lucide="' + (debtChange <= 0 ? 'trending-down' : 'trending-up') + '"></i> الديون ' + Math.abs(Math.round(debtChange)) + '%</div>' +
        '<div class="trend ' + (paidChange >= 0 ? 'text-success' : 'text-danger') + '"><i data-lucide="' + (paidChange >= 0 ? 'trending-up' : 'trending-down') + '"></i> التحصيل ' + Math.abs(Math.round(paidChange)) + '%</div>' +
        '</div>';
    safeCreateIcons();
}

// ==================== الأهداف ====================

function renderGoals() {
    const container = document.getElementById('goalsContainer');
    if (!container) return;

    const today = new Date();
    const currentMonth = today.toISOString().substring(0, 7);
    const currentYear = today.getFullYear().toString();

    let monthCollection = 0;
    let yearCollection = 0;

    for (let i = 0; i < APP.debtors.length; i++) {
        const transactions = APP.debtors[i].transactions;
        for (let j = 0; j < transactions.length; j++) {
            const t = transactions[j];
            if (t.type !== 'payment') continue;
            if (t.date.substring(0, 7) === currentMonth) monthCollection += t.amount;
            if (t.date.substring(0, 4) === currentYear) yearCollection += t.amount;
        }
    }

    const monthPct = APP.goals.monthly > 0 ? Math.min(100, (monthCollection / APP.goals.monthly) * 100) : 0;
    const yearPct = APP.goals.yearly > 0 ? Math.min(100, (yearCollection / APP.goals.yearly) * 100) : 0;

    container.innerHTML =
        '<div class="goal-card">' +
            '<div class="goal-header"><h4>هدف الشهر</h4><button class="btn-icon-sm" data-action="edit-goal" data-type="monthly"><i data-lucide="edit-2"></i></button></div>' +
            '<div class="goal-progress-circle"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" stroke-width="8" stroke-dasharray="' + (2 * Math.PI * 42) + '" stroke-dashoffset="' + (2 * Math.PI * 42 * (1 - monthPct / 100)) + '" transform="rotate(-90 50 50)"/></svg><div class="goal-percent">' + Math.round(monthPct) + '%</div></div>' +
            '<div class="goal-info"><strong>' + formatCurrency(monthCollection) + '</strong> / ' + formatCurrency(APP.goals.monthly) + '</div>' +
        '</div>' +
        '<div class="goal-card">' +
            '<div class="goal-header"><h4>هدف السنة</h4><button class="btn-icon-sm" data-action="edit-goal" data-type="yearly"><i data-lucide="edit-2"></i></button></div>' +
            '<div class="goal-progress-circle"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="var(--success)" stroke-width="8" stroke-dasharray="' + (2 * Math.PI * 42) + '" stroke-dashoffset="' + (2 * Math.PI * 42 * (1 - yearPct / 100)) + '" transform="rotate(-90 50 50)"/></svg><div class="goal-percent">' + Math.round(yearPct) + '%</div></div>' +
            '<div class="goal-info"><strong>' + formatCurrency(yearCollection) + '</strong> / ' + formatCurrency(APP.goals.yearly) + '</div>' +
        '</div>';

    container.querySelectorAll('[data-action="edit-goal"]').forEach(function(btn) {
        btn.onclick = function() {
            const type = this.dataset.type;
            const newVal = prompt('أدخل هدف ' + (type === 'monthly' ? 'الشهر' : 'السنة') + ':', APP.goals[type]);
            if (newVal !== null) {
                APP.goals[type] = parseFloat(newVal) || 0;
                saveGoals();
                renderGoals();
            }
        };
    });
    safeCreateIcons();
}

// ==================== التصدير PDF الحقيقي ====================

function exportToPDF(content, filename) {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        showToast('اسمح بالنوافذ المنبثقة', 'warning');
        return;
    }
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(function() { printWindow.print(); }, 500);
}

function generateReport(type) {
    const today = new Date().toLocaleDateString('ar-EG');
    let content = '';

    if (type === 'overdue') {
        const overdue = [];
        APP.debtors.forEach(function(d) {
            d.transactions.forEach(function(t) {
                if (t.type !== 'debt' || !t.dueDate) return;
                const dp = d.transactions.filter(function(p) { return p.type === 'payment' && p.debtId === t.id; }).reduce(function(s, p) { return s + p.amount; }, 0);
                const rem = t.amount - dp;
                if (rem > 0 && t.dueDate < getTodayDate()) {
                    overdue.push({ debtor: d, debt: t, remaining: rem, days: Math.floor((new Date() - new Date(t.dueDate)) / 86400000) });
                }
            });
        });

        let rows = '';
        overdue.forEach(function(o) {
            rows += '<tr><td>' + escapeHtml(o.debtor.name) + '</td><td>' + escapeHtml(o.debt.description) + '</td><td>' + formatCurrency(o.remaining) + '</td><td>' + formatDate(o.debt.dueDate) + '</td><td>' + o.days + ' يوم</td></tr>';
        });

        content = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير الديون المتأخرة</title>' +
            '<style>body{font-family:Tahoma,Arial;padding:2rem}h1{color:#ef4444}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:0.75rem;border:1px solid #ddd;text-align:right}th{background:#fee2e2}</style>' +
            '</head><body><h1>تقرير الديون المتأخرة</h1><p>تاريخ التقرير: ' + today + '</p>' +
            '<p>عدد الديون المتأخرة: <strong>' + overdue.length + '</strong></p>' +
            '<table><thead><tr><th>المديون</th><th>الوصف</th><th>المتبقي</th><th>الاستحقاق</th><th>أيام التأخير</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<script>setTimeout(function(){window.print();},500);<' + '/script></body></html>';
    } else if (type === 'monthly') {
        const month = document.getElementById('reportMonth').value;
        if (!month) { showToast('اختر الشهر', 'warning'); return; }
        const monthData = { debt: 0, paid: 0, items: [] };
        APP.debtors.forEach(function(d) {
            d.transactions.forEach(function(t) {
                if (t.date.substring(0, 7) !== month) return;
                if (t.type === 'debt') monthData.debt += t.amount;
                else monthData.paid += t.amount;
                monthData.items.push({ debtor: d, transaction: t });
            });
        });

        let rows = '';
        monthData.items.forEach(function(i) {
            rows += '<tr><td>' + formatDate(i.transaction.date) + '</td><td>' + escapeHtml(i.debtor.name) + '</td><td>' + (i.transaction.type === 'debt' ? 'دين' : 'سداد') + '</td><td>' + escapeHtml(i.transaction.description || (i.transaction.type === 'payment' ? 'سداد' : '')) + '</td><td>' + formatCurrency(i.transaction.amount) + '</td></tr>';
        });

        content = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير شهري</title>' +
            '<style>body{font-family:Tahoma,Arial;padding:2rem}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1rem 0}.box{padding:1rem;border:1px solid #ddd;text-align:center;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:0.75rem;border:1px solid #ddd;text-align:right}th{background:#eef2ff}</style>' +
            '</head><body><h1>التقرير الشهري - ' + month + '</h1><p>تاريخ الإنشاء: ' + today + '</p>' +
            '<div class="summary"><div class="box"><small>ديون جديدة</small><br><strong>' + formatCurrency(monthData.debt) + '</strong></div>' +
            '<div class="box"><small>تحصيلات</small><br><strong style="color:#10b981">' + formatCurrency(monthData.paid) + '</strong></div>' +
            '<div class="box"><small>صافي</small><br><strong>' + formatCurrency(monthData.paid - monthData.debt) + '</strong></div></div>' +
            '<table><thead><tr><th>التاريخ</th><th>المديون</th><th>النوع</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<script>setTimeout(function(){window.print();},500);<' + '/script></body></html>';
    }

    if (content) exportToPDF(content, 'report-' + getTodayDate());
}

// ==================== التصدير الشامل PDF ====================

function exportFullPDF() {
    const today = new Date().toLocaleDateString('ar-EG');
    const stats = getGlobalStats();

    let debtorRows = '';
    APP.debtors.forEach(function(d) {
        const t = getDebtorTotals(d);
        const trust = calculateTrustScore(d);
        debtorRows += '<tr><td>' + escapeHtml(d.name) + '</td><td>' + escapeHtml(d.phone || '-') + '</td><td>' + formatCurrency(t.total) + '</td><td>' + formatCurrency(t.paid) + '</td><td>' + formatCurrency(t.remaining) + '</td><td>' + trust + '%</td></tr>';
    });

    const content = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير شامل</title>' +
        '<style>body{font-family:Tahoma,Arial;padding:2rem}h1{text-align:center;color:#6366f1}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:1rem 0}.box{padding:1rem;border:1px solid #ddd;text-align:center;border-radius:8px;background:#f8fafc}.box strong{font-size:1.2rem;color:#6366f1}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:0.6rem;border:1px solid #ddd;text-align:right;font-size:0.9rem}th{background:#eef2ff}</style>' +
        '</head><body><h1>التقرير الشامل لإدارة الديون</h1><p style="text-align:center">تاريخ التقرير: ' + today + '</p>' +
        '<div class="summary">' +
            '<div class="box"><small>إجمالي الديون</small><br><strong>' + formatCurrency(stats.totalRequired) + '</strong></div>' +
            '<div class="box"><small>المحصل</small><br><strong style="color:#10b981">' + formatCurrency(stats.totalPaid) + '</strong></div>' +
            '<div class="box"><small>المتبقي</small><br><strong style="color:#ef4444">' + formatCurrency(stats.totalRemaining) + '</strong></div>' +
            '<div class="box"><small>المديونين</small><br><strong>' + stats.totalDebtors + '</strong></div>' +
        '</div>' +
        '<h2>قائمة المديونين</h2>' +
        '<table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الإجمالي</th><th>المسددة</th><th>المتبقية</th><th>الثقة</th></tr></thead><tbody>' + debtorRows + '</tbody></table>' +
        '<script>setTimeout(function(){window.print();},500);<' + '/script></body></html>';

    exportToPDF(content, 'full-report-' + getTodayDate());
}

// ==================== سجل المعاملات (للتفاصيل) ====================

function renderTransactions(debtor) {
    const list = document.getElementById('transactionsList');
    if (!list) return;

    if (!debtor.transactions || debtor.transactions.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><i data-lucide="file-plus"></i><p>لا توجد عمليات مسجلة</p></div>';
        safeCreateIcons();
        return;
    }

    const sorted = debtor.transactions.slice().sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
    });

    list.innerHTML = '';

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        let item;
        if (t.type === 'debt') {
            let paidSoFar = 0;
            for (let j = 0; j < debtor.transactions.length; j++) {
                const p = debtor.transactions[j];
                if (p.type === 'payment' && p.debtId === t.id) paidSoFar += p.amount;
            }
            const remaining = t.amount - paidSoFar;

            const today = getTodayDate();
            const isOverdue = t.dueDate && t.dueDate < today && remaining > 0;

            item = document.createElement('div');
            item.className = 'transaction-item t-debt';

            let metaHtml = '<span><i data-lucide="calendar"></i> ' + formatDate(t.date) + '</span>';
            if (t.dueDate) {
                metaHtml += '<span><i data-lucide="calendar-check"></i> استحقاق: ' + formatDate(t.dueDate) + (isOverdue ? ' ⚠️' : '') + '</span>';
            }
            if (remaining <= 0) {
                metaHtml += '<span class="text-success">✓ مسدد بالكامل</span>';
            } else {
                metaHtml += '<span>المتبقي: ' + formatCurrency(remaining) + '</span>';
            }

            item.innerHTML =
                '<div class="transaction-icon"><i data-lucide="trending-up"></i></div>' +
                '<div class="transaction-details">' +
                    '<div class="transaction-title">' + escapeHtml(t.description) + '</div>' +
                    '<div class="transaction-meta">' + metaHtml + '</div>' +
                '</div>' +
                '<div class="transaction-amount">+' + formatCurrency(t.amount) + '</div>' +
                '<button class="btn-icon btn-pay" data-tx-id="' + t.id + '" title="تسجيل سداد" aria-label="تسجيل سداد">' +
                    '<i data-lucide="check"></i>' +
                '</button>' +
                '<button class="btn-icon btn-del" data-tx-id="' + t.id + '" title="حذف" aria-label="حذف العملية">' +
                    '<i data-lucide="trash-2"></i>' +
                '</button>';
        } else {
            let originalDebt = null;
            for (let j = 0; j < debtor.transactions.length; j++) {
                if (debtor.transactions[j].id === t.debtId) { originalDebt = debtor.transactions[j]; break; }
            }
            const debtDesc = originalDebt ? originalDebt.description : 'دين';

            item = document.createElement('div');
            item.className = 'transaction-item t-payment';

            let metaHtml = '<span><i data-lucide="calendar"></i> ' + formatDate(t.date) + '</span>';
            if (t.method) metaHtml += '<span><i data-lucide="credit-card"></i> ' + (t.method === 'cash' ? 'نقدي' : t.method === 'transfer' ? 'تحويل' : t.method === 'check' ? 'شيك' : t.method === 'card' ? 'بطاقة' : 'أخرى') + '</span>';
            if (t.notes) {
                metaHtml += '<span><i data-lucide="file-text"></i> ' + escapeHtml(t.notes) + '</span>';
            }

            item.innerHTML =
                '<div class="transaction-icon"><i data-lucide="check"></i></div>' +
                '<div class="transaction-details">' +
                    '<div class="transaction-title">سداد: ' + escapeHtml(debtDesc) + '</div>' +
                    '<div class="transaction-meta">' + metaHtml + '</div>' +
                '</div>' +
                '<div class="transaction-amount">-' + formatCurrency(t.amount) + '</div>' +
                '<button class="btn-icon btn-del" data-tx-id="' + t.id + '" title="حذف" aria-label="حذف العملية">' +
                    '<i data-lucide="trash-2"></i>' +
                '</button>';
        }

        fragment.appendChild(item);
    }

    list.innerHTML = '';
    list.appendChild(fragment);
    safeCreateIcons();
}

function openDebtModal(debtorId) {
    APP.currentDebtorId = debtorId;
    document.getElementById('debtDate').value = getTodayDate();
    openModal('debtModal');
}

// ==================== رسائل التأكيد ====================

let confirmCallback = null;

function showConfirm(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    openModal('confirmModal');
}

// ==================== واتساب ====================

function sendWhatsAppReminder(debtorId) {
    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor || !debtor.phone) {
        showToast('لا يوجد رقم هاتف لهذا المديون', 'warning');
        return;
    }

    const totals = getDebtorTotals(debtor);
    if (totals.remaining <= 0) {
        showToast('هذا المديون مسدد بالكامل', 'info');
        return;
    }

    const phone = cleanPhoneForWhatsApp(debtor.phone);
    if (!phone) {
        showToast('رقم الهاتف غير صالح', 'warning');
        return;
    }

    const today = getTodayDate();
    const pendingDebts = debtor.transactions
        .filter(function(t) { return t.type === 'debt'; })
        .map(function(t) {
            const paidSoFar = debtor.transactions
                .filter(function(p) { return p.type === 'payment' && p.debtId === t.id; })
                .reduce(function(sum, p) { return sum + p.amount; }, 0);
            const remaining = t.amount - paidSoFar;
            return { desc: t.description, amount: t.amount, paidSoFar: paidSoFar, remaining: remaining, dueDate: t.dueDate };
        })
        .filter(function(t) { return t.remaining > 0; });

    let message = 'السلام عليكم ' + debtor.name + ' 🌹\n\n';
    message += 'أتمنى أن تكون بخير. أحببت أن أذكّرك بالمبلغ المستحق عليك:\n\n';

    if (pendingDebts.length === 1) {
        const d = pendingDebts[0];
        message += '📌 ' + d.desc + '\n';
        message += '💰 المبلغ الأصلي: ' + formatCurrency(d.amount) + ' ' + getDefaultCurrencySymbol() + '\n';
        if (d.paidSoFar > 0) {
            message += '✅ المسدد: ' + formatCurrency(d.paidSoFar) + ' ' + getDefaultCurrencySymbol() + '\n';
        }
        message += '📉 المتبقي: ' + formatCurrency(d.remaining) + ' ' + getDefaultCurrencySymbol() + '\n';
        if (d.dueDate) {
            const isOverdue = d.dueDate < today;
            message += '📅 تاريخ الاستحقاق: ' + formatDate(d.dueDate) + (isOverdue ? ' (متأخر ⚠️)' : '') + '\n';
        }
    } else {
        message += '📋 لديك ' + pendingDebts.length + ' ديون قائمة:\n\n';
        pendingDebts.forEach(function(d, i) {
            message += (i + 1) + '. ' + d.desc + '\n';
            message += '   المبلغ: ' + formatCurrency(d.amount) + ' | المتبقي: ' + formatCurrency(d.remaining) + ' ' + getDefaultCurrencySymbol() + '\n';
            if (d.dueDate) {
                const isOverdue = d.dueDate < today;
                message += '   الاستحقاق: ' + formatDate(d.dueDate) + (isOverdue ? ' (متأخر)' : '') + '\n';
            }
            message += '\n';
        });
        message += '💰 الإجمالي المتبقي: ' + formatCurrency(totals.remaining) + ' ' + getDefaultCurrencySymbol() + '\n';
    }

    message += '\nأرجو التكرم بالسداد في أقرب وقت ممكن. ';
    message += 'في حال تم السداد بالفعل، يرجى تجاهل هذه الرسالة.\n\n';
    message += 'شاكرين لك مقدماً 🙏';

    const encodedMessage = encodeURIComponent(message);
    const url = 'https://wa.me/' + phone + '?text=' + encodedMessage;

    window.open(url, '_blank');
    showToast('تم فتح واتساب', 'success');
}

// ==================== التصدير والاستيراد ====================

function exportData() {
    if (APP.debtors.length === 0) {
        showToast('لا توجد بيانات للتصدير', 'warning');
        return;
    }

    const exportObj = {
        appName: 'إدارة الديون',
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        debtorsCount: APP.debtors.length,
        debtors: APP.debtors
    };

    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'debt-management-backup-' + getTodayDate() + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('تم تصدير البيانات بصيغة JSON', 'success');
}

let xlsxLoadingPromise = null;
function loadXLSXLibrary() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (xlsxLoadingPromise) return xlsxLoadingPromise;
    xlsxLoadingPromise = new Promise(function(resolve, reject) {
        const script = document.createElement('script');
        script.src = 'libs/xlsx.full.min.js';
        script.async = true;
        script.onload = function() { resolve(); };
        script.onerror = function() { xlsxLoadingPromise = null; reject(new Error('فشل تحميل المكتبة')); };
        document.head.appendChild(script);
    });
    return xlsxLoadingPromise;
}

function exportToExcel() {
    if (APP.debtors.length === 0) {
        showToast('لا توجد بيانات للتصدير', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showToast('جاري تحميل مكتبة Excel...', 'info');
        loadXLSXLibrary().then(exportToExcel).catch(function() {
            showToast('فشل تحميل مكتبة Excel', 'error');
        });
        return;
    }

    const rows = [];
    APP.debtors.forEach(function(debtor) {
        debtor.transactions.forEach(function(t) {
            const paidSoFar = debtor.transactions
                .filter(function(p) { return p.type === 'payment' && p.debtId === t.id; })
                .reduce(function(sum, p) { return sum + p.amount; }, 0);

            if (t.type === 'debt') {
                rows.push({
                    'المديون': debtor.name,
                    'رقم الهاتف': debtor.phone || '',
                    'نوع العملية': 'دين',
                    'الوصف': t.description,
                    'المبلغ': t.amount,
                    'المتبقي': t.amount - paidSoFar,
                    'التاريخ': t.date,
                    'تاريخ الاستحقاق': t.dueDate || '',
                    'ملاحظات': debtor.notes || ''
                });
            } else {
                const originalDebt = debtor.transactions.find(function(d) { return d.id === t.debtId; });
                rows.push({
                    'المديون': debtor.name,
                    'رقم الهاتف': debtor.phone || '',
                    'نوع العملية': 'سداد',
                    'الوصف': originalDebt ? originalDebt.description : '',
                    'المبلغ': t.amount,
                    'المتبقي': 0,
                    'التاريخ': t.date,
                    'تاريخ الاستحقاق': '',
                    'ملاحظات': t.notes || ''
                });
            }
        });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الديون');

    ws['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 30 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }
    ];

    XLSX.writeFile(wb, 'debt-management-' + getTodayDate() + '.xlsx');
    showToast('تم تصدير ملف Excel بنجاح', 'success');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.debtors || !Array.isArray(data.debtors)) {
                throw new Error('صيغة الملف غير صحيحة');
            }

            showConfirm(
                'سيتم استبدال جميع البيانات الحالية بـ ' + data.debtors.length + ' مديون من الملف المستورد. هل تريد المتابعة؟',
                function() {
                    APP.debtors = data.debtors;
                    saveData();
                    renderAll();
                    showToast('تم استيراد البيانات بنجاح', 'success');
                }
            );
        } catch (err) {
            console.error(err);
            showToast('فشل استيراد الملف: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ==================== طباعة كشف الحساب ====================

function printStatement(debtorId) {
    const debtor = APP.debtors.find(function(d) { return d.id === debtorId; });
    if (!debtor) return;

    const totals = getDebtorTotals(debtor);

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'warning');
        return;
    }

    const sortedTransactions = debtor.transactions.slice().sort(function(a, b) {
        return new Date(a.date) - new Date(b.date);
    });

    let tableRows = '';
    if (sortedTransactions.length > 0) {
        sortedTransactions.forEach(function(t) {
            let desc = t.description || '';
            if (t.type === 'payment') {
                const od = sortedTransactions.find(function(d) { return d.id === t.debtId; });
                desc = 'سداد: ' + (od ? od.description : '');
            }
            tableRows += '<tr class="' + t.type + '">' +
                '<td>' + formatDate(t.date) + '</td>' +
                '<td>' + escapeHtml(desc) + '</td>' +
                '<td>' + (t.type === 'debt' ? 'دين' : 'سداد') + '</td>' +
                '<td><strong>' + (t.type === 'debt' ? '+' : '-') + formatCurrency(t.amount) + '</strong></td>' +
                '</tr>';
        });
    }

    const tableHtml = sortedTransactions.length > 0
        ? '<table><thead><tr><th>التاريخ</th><th>الوصف</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>' + tableRows + '</tbody></table>'
        : '<p style="text-align:center;color:#666;">لا توجد عمليات مسجلة</p>';

    const html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف حساب - ' + escapeHtml(debtor.name) + '</title>' +
        '<style>' +
        '* { box-sizing: border-box; }' +
        'body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; padding: 2rem; color: #000; background: #fff; }' +
        '.header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 1rem; margin-bottom: 2rem; }' +
        '.header h1 { margin: 0 0 0.5rem 0; }' +
        '.header p { margin: 0; color: #666; }' +
        '.info-section { margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px; }' +
        '.info-row { display: flex; gap: 1rem; margin-bottom: 0.5rem; }' +
        '.info-row strong { min-width: 100px; }' +
        '.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1.5rem 0; }' +
        '.summary-box { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; text-align: center; }' +
        '.summary-box small { color: #666; display: block; margin-bottom: 0.5rem; }' +
        '.summary-box strong { font-size: 1.25rem; }' +
        'table { width: 100%; border-collapse: collapse; margin-top: 1rem; }' +
        'th, td { padding: 0.75rem; text-align: right; border: 1px solid #ddd; }' +
        'th { background: #f1f5f9; font-weight: 700; }' +
        'tr.debt td { background: #dbeafe; }' +
        'tr.payment td { background: #d1fae5; }' +
        '.footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 0.85rem; }' +
        '@media print { body { padding: 1rem; } }' +
        '</style></head><body>' +
        '<div class="header"><h1>كشف حساب مديون</h1><p>تاريخ الإصدار: ' + formatDate(new Date().toISOString()) + '</p></div>' +
        '<div class="info-section">' +
        '<div class="info-row"><strong>الاسم:</strong> ' + escapeHtml(debtor.name) + '</div>' +
        '<div class="info-row"><strong>رقم الهاتف:</strong> ' + (debtor.phone || '-') + '</div>' +
        '<div class="info-row"><strong>ملاحظات:</strong> ' + (debtor.notes || '-') + '</div>' +
        '</div>' +
        '<div class="summary">' +
        '<div class="summary-box"><small>إجمالي الديون</small><strong>' + formatCurrency(totals.total) + ' ' + getDefaultCurrencySymbol() + '</strong></div>' +
        '<div class="summary-box"><small>المسددة</small><strong style="color: #10b981;">' + formatCurrency(totals.paid) + ' ' + getDefaultCurrencySymbol() + '</strong></div>' +
        '<div class="summary-box"><small>المتبقية</small><strong style="color: #ef4444;">' + formatCurrency(totals.remaining) + ' ' + getDefaultCurrencySymbol() + '</strong></div>' +
        '</div>' +
        '<h3>سجل العمليات</h3>' + tableHtml +
        '<div class="footer"><p>تم إنشاء هذا الكشف بواسطة تطبيق إدارة الديون</p></div>' +
        '<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };<' + '/script>' +
        '</body></html>';

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}

// ==================== الوضع الداكن / الفاتح ====================

function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || 'light';
    setTheme(theme);
}

function applyAppearanceSettings() {
    const root = document.documentElement;
    if (APP.settings.accentColor) {
        root.style.setProperty('--primary', APP.settings.accentColor);
        root.style.setProperty('--primary-hover', shadeColor(APP.settings.accentColor, -10));
    }
    if (APP.settings.fontSize === 'small') {
        root.style.setProperty('--base-font-size', '14px');
    } else if (APP.settings.fontSize === 'large') {
        root.style.setProperty('--base-font-size', '17px');
    } else {
        root.style.setProperty('--base-font-size', '15px');
    }
    if (APP.settings.compactMode) {
        root.classList.add('compact-mode');
    } else {
        root.classList.remove('compact-mode');
    }
}

function shadeColor(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = Math.max(0, Math.min(255, R + Math.round(R * percent / 100)));
    G = Math.max(0, Math.min(255, G + Math.round(G * percent / 100)));
    B = Math.max(0, Math.min(255, B + Math.round(B * percent / 100)));
    return '#' + R.toString(16).padStart(2, '0') + G.toString(16).padStart(2, '0') + B.toString(16).padStart(2, '0');
}

function populateSettingsUI() {
    const s = APP.settings;
    const set = function(id, v) { const el = document.getElementById(id); if (el) el.value = v; };
    const setChk = function(id, v) { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('defaultCurrency', s.defaultCurrency);
    set('reminderDays', s.reminderDays);
    set('whatsappCountryCode', s.whatsappCountryCode);
    setChk('enableNotifications', s.enableNotifications);
    setChk('autoBackup', s.autoBackup);
    setChk('autoInterest', s.autoInterest);
    set('interestRate', s.interestRate);
    set('gracePeriodDays', s.gracePeriodDays);
    set('userName', s.userName);
    setChk('enablePassword', s.enablePassword);
    setChk('enableEncryption', s.enableEncryption);
    setChk('autoCloudBackup', s.autoCloudBackup);
    setChk('compactMode', s.compactMode);
    const themeRadio = document.querySelector('input[name="theme"][value="' + (s.theme || 'light') + '"]');
    if (themeRadio) themeRadio.checked = true;
    document.querySelectorAll('.color-option').forEach(function(b) {
        b.classList.toggle('active', b.dataset.color === s.accentColor);
    });
    document.querySelectorAll('.size-option').forEach(function(b) {
        b.classList.toggle('active', b.dataset.size === (s.fontSize || 'medium'));
    });
    const pg = document.getElementById('passwordGroup');
    if (pg) pg.hidden = !s.enablePassword;
    const dataStats = document.getElementById('dataStats');
    if (dataStats) {
        const count = APP.debtors.length;
        const txCount = APP.debtors.reduce(function(sum, d) { return sum + (d.transactions || []).length; }, 0);
        const attCount = APP.debtors.reduce(function(sum, d) { return sum + (d.attachments || []).length; }, 0);
        dataStats.innerHTML =
            '<div class="stat-pill"><strong>' + count + '</strong> مديون</div>' +
            '<div class="stat-pill"><strong>' + txCount + '</strong> عملية</div>' +
            '<div class="stat-pill"><strong>' + attCount + '</strong> مرفق</div>';
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    const btn = document.getElementById('themeToggle');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
            safeCreateIcons();
        }
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// ==================== التوجيه (Routing) ====================

const ROUTES = ['dashboard', 'analytics', 'reports', 'archive', 'debtors-list'];
const ROUTE_LABELS = {
    'dashboard': 'الرئيسية',
    'analytics': 'التحليلات',
    'reports': 'التقارير',
    'archive': 'الأرشيف',
    'debtors-list': 'المديونين'
};

function setupRouting() {
    window.addEventListener('hashchange', routeFromHash);
    document.body.addEventListener('click', function(e) {
        const link = e.target.closest('a[data-route]');
        if (!link) return;
        const route = link.dataset.route;
        if (ROUTES.indexOf(route) !== -1) {
            e.preventDefault();
            navigateTo(route);
        }
    });
}

function routeFromHash() {
    let hash = (window.location.hash || '').replace('#', '').trim();
    if (!hash || ROUTES.indexOf(hash) === -1) hash = 'dashboard';
    switchView(hash);
}

function navigateTo(viewName) {
    if (ROUTES.indexOf(viewName) === -1) viewName = 'dashboard';
    if ((window.location.hash || '').replace('#', '') !== viewName) {
        if (history.pushState) history.pushState(null, '', '#' + viewName);
        else window.location.hash = viewName;
    }
    switchView(viewName);
}

// ==================== ربط الأحداث ====================

function bindEvents() {
    const addBtn = document.getElementById('addDebtorBtn');
    if (!addBtn) return;
    addBtn.addEventListener('click', function() {
        document.getElementById('debtorForm').reset();
        document.getElementById('debtorId').value = '';
        document.getElementById('debtorArchived').value = 'false';
        resetDebtorProducts();
        applyDateQuickMode('today', 0);
        document.getElementById('debtorModalTitle').innerHTML = '<i data-lucide="user-plus"></i> إضافة مديون جديد';
        safeCreateIcons();
        openModal('debtorModal');
    });

    document.getElementById('debtorForm').addEventListener('submit', saveDebtor);
    document.getElementById('debtForm').addEventListener('submit', saveDebt);
    document.getElementById('paymentForm').addEventListener('submit', savePayment);
    document.getElementById('installmentForm').addEventListener('submit', saveInstallment);
    document.getElementById('checkForm').addEventListener('submit', saveCheck);
    document.getElementById('promiseForm').addEventListener('submit', savePromise);

    document.getElementById('attachmentInput').addEventListener('change', handleAttachment);

    const debouncedRenderDebtors = debounce(renderDebtors, 150);
    document.getElementById('searchInput').addEventListener('input', debouncedRenderDebtors);
    document.getElementById('sortSelect').addEventListener('change', renderDebtors);
    ['filterCategory', 'filterMinAmount', 'filterMaxAmount', 'filterDateFrom', 'filterDateTo'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderDebtors);
        if (el) el.addEventListener('input', debouncedRenderDebtors);
    });

    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) resetBtn.addEventListener('click', function() {
        ['filterCategory', 'filterMinAmount', 'filterMaxAmount', 'filterDateFrom', 'filterDateTo'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        renderDebtors();
    });

    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchInput = document.getElementById('searchInput');
    if (clearSearchBtn && searchInput) {
        searchInput.addEventListener('input', function() {
            clearSearchBtn.hidden = !searchInput.value;
        });
        clearSearchBtn.addEventListener('click', function() {
            searchInput.value = '';
            clearSearchBtn.hidden = true;
            renderDebtors();
        });
    }

    document.getElementById('bulkWhatsApp')?.addEventListener('click', bulkWhatsApp);
    document.getElementById('bulkArchive')?.addEventListener('click', bulkArchive);
    document.getElementById('bulkExport')?.addEventListener('click', bulkExport);
    document.getElementById('clearSelection')?.addEventListener('click', clearSelection);

    const emptyStateAddBtn = document.getElementById('emptyStateAddBtn');
    if (emptyStateAddBtn && addBtn) {
        emptyStateAddBtn.addEventListener('click', function() { addBtn.click(); });
    }

    document.querySelectorAll('.filter-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            APP.currentFilter = tab.dataset.filter;
            renderDebtors();
        });
    });

    document.querySelectorAll('.details-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.details-tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.details-tab-content').forEach(function(c) { c.hidden = true; c.classList.remove('active'); });
            tab.classList.add('active');
            const content = document.querySelector('[data-details-content="' + tab.dataset.detailsTab + '"]');
            if (content) { content.hidden = false; content.classList.add('active'); }
            safeCreateIcons();
        });
    });

    document.querySelectorAll('[data-close]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const modalId = btn.getAttribute('data-close');
            closeModal(modalId);
        });
    });

    document.querySelectorAll('.modal').forEach(function(modal) {
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', function() {
                modal.hidden = true;
                document.body.style.overflow = '';
            });
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not([hidden])').forEach(function(modal) {
                modal.hidden = true;
            });
            document.body.style.overflow = '';
        }
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                document.getElementById('addDebtorBtn').click();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                toggleTheme();
            } else if (e.key >= '1' && e.key <= '3') {
                e.preventDefault();
                const views = ['dashboard', 'analytics', 'reports', 'archive'];
                switchView(views[parseInt(e.key) - 1]);
            }
        }
    });

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    document.getElementById('exportJsonBtn').addEventListener('click', exportData);
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    document.getElementById('exportFullPDF')?.addEventListener('click', exportFullPDF);
    document.getElementById('generateMonthlyReport')?.addEventListener('click', function() { generateReport('monthly'); });
    document.getElementById('generateOverdueReport')?.addEventListener('click', function() { generateReport('overdue'); });
    document.getElementById('generateDebtorReport')?.addEventListener('click', function() {
        const debtorId = document.getElementById('reportDebtor').value;
        if (debtorId) printStatement(debtorId);
        else showToast('اختر مديون', 'warning');
    });
    document.getElementById('generateCollectionReport')?.addEventListener('click', function() {
        const from = document.getElementById('collectionFrom').value;
        const to = document.getElementById('collectionTo').value;
        showToast('تم تجهيز التقرير - استخدم PDF', 'info');
    });

    document.getElementById('saveSettingsBtn')?.addEventListener('click', function() {
        APP.settings.defaultCurrency = document.getElementById('defaultCurrency').value;
        APP.settings.reminderDays = parseInt(document.getElementById('reminderDays').value) || 7;
        APP.settings.whatsappCountryCode = document.getElementById('whatsappCountryCode').value || '966';
        APP.settings.enableNotifications = document.getElementById('enableNotifications').checked;
        APP.settings.autoBackup = document.getElementById('autoBackup').checked;
        APP.settings.autoInterest = document.getElementById('autoInterest')?.checked || false;
        APP.settings.interestRate = parseFloat(document.getElementById('interestRate')?.value) || 0;
        APP.settings.gracePeriodDays = parseInt(document.getElementById('gracePeriodDays')?.value) || 0;
        APP.settings.userName = document.getElementById('userName')?.value || '';
        APP.settings.enablePassword = document.getElementById('enablePassword')?.checked || false;
        APP.settings.enableEncryption = document.getElementById('enableEncryption')?.checked || false;
        APP.settings.autoCloudBackup = document.getElementById('autoCloudBackup')?.checked || false;
        APP.settings.compactMode = document.getElementById('compactMode')?.checked || false;
        const themeRadio = document.querySelector('input[name="theme"]:checked');
        if (themeRadio) APP.settings.theme = themeRadio.value;
        const accent = document.querySelector('.color-option.active');
        if (accent) APP.settings.accentColor = accent.dataset.color;
        const size = document.querySelector('.size-option.active');
        if (size) APP.settings.fontSize = size.dataset.size;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(APP.settings));
        } catch (e) {
            console.error('خطأ في حفظ الإعدادات:', e);
        }
        applyAppearanceSettings();
        renderAll();
        closeModal('settingsModal');
        showToast('تم حفظ الإعدادات', 'success');
    });

    document.getElementById('importAllBtn').addEventListener('click', function() {
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            importData(file);
            e.target.value = '';
        }
    });

    document.getElementById('confirmActionBtn').addEventListener('click', function() {
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
        closeModal('confirmModal');
    });

    // تفويض الأحداث للأزرار الديناميكية
    document.getElementById('debtorsGrid').addEventListener('click', function(e) {
        const checkbox = e.target.closest('.debtor-select-checkbox');
        if (checkbox) {
            e.stopPropagation();
            toggleDebtorSelection(checkbox.dataset.id);
            return;
        }
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'details') showDebtorDetails(id);
        else if (btn.dataset.action === 'whatsapp') sendWhatsAppReminder(id);
    });

    document.getElementById('archiveGrid')?.addEventListener('click', function(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'details') showDebtorDetails(id);
        else if (btn.dataset.action === 'unarchive') {
            const d = APP.debtors.find(function(x) { return x.id === id; });
            if (d) { d.archived = false; saveData(); renderAll(); switchView('archive'); }
        }
    });

    document.getElementById('debtorsTableBody')?.addEventListener('click', function(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'details') showDebtorDetails(id);
        else if (btn.dataset.action === 'edit') editDebtor(id);
        else if (btn.dataset.action === 'log-call') openCallLogModal(id);
        else if (btn.dataset.action === 'whatsapp') sendWhatsAppReminder(id);
    });

    document.getElementById('callsList')?.addEventListener('click', function(e) {
        const delBtn = e.target.closest('.btn-delete-call');
        if (delBtn) deleteCallLog(delBtn.dataset.callId);
    });

    document.getElementById('transactionsList').addEventListener('click', function(e) {
        const payBtn = e.target.closest('.btn-pay');
        if (payBtn) {
            openPaymentModal(payBtn.dataset.txId);
            return;
        }
        const delBtn = e.target.closest('.btn-del');
        if (delBtn) {
            deleteTransaction(delBtn.dataset.txId);
            return;
        }
    });

    document.body.addEventListener('click', function(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'pay-installment') {
            payInstallment(btn.dataset.inst, btn.dataset.sched);
        } else if (action === 'cash-check') {
            updateCheckStatus(btn.dataset.check, 'cashed');
        } else if (action === 'bounce-check') {
            updateCheckStatus(btn.dataset.check, 'bounced');
        } else if (action === 'keep-promise') {
            updatePromiseStatus(btn.dataset.promise, 'kept');
        } else if (action === 'break-promise') {
            updatePromiseStatus(btn.dataset.promise, 'broken');
        } else if (action === 'delete-attachment') {
            deleteAttachment(btn.dataset.att);
        }
    });

    document.getElementById('editDebtorBtn')?.addEventListener('click', function() {
        if (APP.currentDebtorId) editDebtor(APP.currentDebtorId);
    });

    document.getElementById('logoBtn')?.addEventListener('click', function() { switchView('dashboard'); });

    document.getElementById('settingsBtn')?.addEventListener('click', function() {
        populateSettingsUI();
        openModal('settingsModal');
    });

    document.querySelectorAll('input[name="theme"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (radio.checked) setTheme(radio.value);
        });
    });

    document.querySelectorAll('.color-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            const root = document.documentElement;
            root.style.setProperty('--primary', btn.dataset.color);
            root.style.setProperty('--primary-hover', shadeColor(btn.dataset.color, -10));
        });
    });

    document.querySelectorAll('.size-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.size-option').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            const root = document.documentElement;
            const sizes = { small: '14px', medium: '15px', large: '17px' };
            root.style.setProperty('--base-font-size', sizes[btn.dataset.size] || '15px');
        });
    });

    document.getElementById('compactMode')?.addEventListener('change', function() {
        document.documentElement.classList.toggle('compact-mode', this.checked);
    });

    document.getElementById('enablePassword')?.addEventListener('change', function() {
        const pg = document.getElementById('passwordGroup');
        if (pg) pg.hidden = !this.checked;
    });

    document.getElementById('togglePasswordVisibility')?.addEventListener('click', function() {
        const input = document.getElementById('appPassword');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        const icon = this.querySelector('i');
        if (icon) icon.setAttribute('data-lucide', input.type === 'password' ? 'eye' : 'eye-off');
        safeCreateIcons();
    });

    document.getElementById('backupNowBtn')?.addEventListener('click', function() {
        const blob = new Blob([JSON.stringify(APP.debtors, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'backup-' + getTodayDate() + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('تم إنشاء النسخة الاحتياطية', 'success');
    });

    document.getElementById('restoreBackupBtn')?.addEventListener('click', function() {
        document.getElementById('restoreFileInput').click();
    });

    document.getElementById('restoreFileInput')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = JSON.parse(ev.target.result);
                const list = Array.isArray(data) ? data : (data.debtors || []);
                showConfirm('سيتم استبدال ' + APP.debtors.length + ' مديون بـ ' + list.length + ' مديون من النسخة. متابعة؟', function() {
                    APP.debtors = list;
                    saveData();
                    renderAll();
                    populateSettingsUI();
                    showToast('تمت الاستعادة بنجاح', 'success');
                });
            } catch (err) {
                showToast('ملف غير صالح', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    document.getElementById('optimizeDataBtn')?.addEventListener('click', function() {
        let removed = 0;
        APP.debtors.forEach(function(d) {
            const before = (d.transactions || []).length;
            d.transactions = (d.transactions || []).filter(function(t) { return t.amount > 0; });
            removed += before - d.transactions.length;
        });
        saveData();
        renderAll();
        showToast('تم التحسين: حذف ' + removed + ' عملية فارغة', 'success');
    });

    document.querySelectorAll('.settings-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.settings-pane').forEach(function(p) { p.classList.remove('active'); });
            tab.classList.add('active');
            const pane = document.querySelector('.settings-pane[data-pane="' + tab.dataset.tab + '"]');
            if (pane) pane.classList.add('active');
        });
    });

    document.getElementById('notificationsBtn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        const panel = document.getElementById('notificationsPanel');
        if (panel) panel.hidden = !panel.hidden;
    });

    document.addEventListener('click', function(e) {
        const panel = document.getElementById('notificationsPanel');
        const btn = document.getElementById('notificationsBtn');
        if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
            panel.hidden = true;
        }
    });

    document.getElementById('clearNotificationsBtn')?.addEventListener('click', function() {
        const list = document.getElementById('notificationsList');
        const badge = document.getElementById('notificationBadge');
        if (list) list.innerHTML = '<div class="empty-state-small"><i data-lucide="bell-off"></i><p>لا توجد تنبيهات</p></div>';
        if (badge) badge.hidden = true;
        safeCreateIcons();
        showToast('تم مسح التنبيهات', 'success');
    });

    document.getElementById('clearAllDataBtn')?.addEventListener('click', function() {
        showConfirm('سيتم حذف جميع البيانات نهائياً. هل أنت متأكد؟', function() {
            APP.debtors = [];
            APP.activityLog = [];
            saveData();
            localStorage.removeItem(ACTIVITY_KEY);
            renderAll();
            showToast('تم مسح جميع البيانات', 'success');
        });
    });

    populateReportDebtorSelect();

    document.getElementById('callLogForm')?.addEventListener('submit', saveCallLog);

    const dSearch = document.getElementById('debtorsListSearch');
    if (dSearch) {
        dSearch.addEventListener('input', function() {
            DEBTORS_LIST_STATE.search = dSearch.value;
            const clearBtn = document.getElementById('clearDebtorsListSearch');
            if (clearBtn) clearBtn.hidden = !dSearch.value;
            renderDebtorsList();
        });
    }
    document.getElementById('clearDebtorsListSearch')?.addEventListener('click', function() {
        if (dSearch) dSearch.value = '';
        DEBTORS_LIST_STATE.search = '';
        document.getElementById('clearDebtorsListSearch').hidden = true;
        renderDebtorsList();
    });

    document.querySelectorAll('#debtorsListFilter .filter-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#debtorsListFilter .filter-tab').forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            DEBTORS_LIST_STATE.filter = tab.dataset.dfilter;
            renderDebtorsList();
        });
    });

    document.getElementById('exportDebtorsListBtn')?.addEventListener('click', exportDebtorsList);

    setupDebtorForm();
}

// ==================== تشغيل أولي ====================

document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    loadSettings();
    loadActivity();
    loadGoals();
    loadTemplates();
    loadData();
    bindEvents();
    applyAppearanceSettings();
    setupRouting();
    routeFromHash();
    renderAll();
    setTimeout(function() {
        populateReportDebtorSelect();
    }, 100);
});