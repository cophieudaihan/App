/*
====================================================
ĐẦU TƯ CỔ TỨC
APP.JS
====================================================

LOGIC DỰ PHÓNG:

NGUỒN 1:
CP GỐC
    ↓
Cổ tức
    ↓
Tiền tái đầu tư

NGUỒN 2:
CP MUA TỪ:
    - Cổ tức tái đầu tư
    - Tiền nạp thêm
    ↓
Cổ tức của nguồn 2
    ↓
Tiền tái đầu tư

KHÔNG:
CP cuối kỳ × cổ tức

CÓ:
CP nguồn × cổ tức
+
CP tái đầu tư đã tồn tại đủ thời gian × cổ tức

Mua theo lô 100 CP.
Tiền chưa đủ mua 100 CP giữ lại.
====================================================
*/


const STORAGE_KEY = "dautucotuc_v3";


const DEFAULT_DATA = {

    deposits: [],

    transactions: [],

    dividends: [],

    settings: {

        fee: 0.25,

        custody: 0.009,

        interest: 4,

        custodyEnabled: true

    }

};


let data = loadData();


/* ==================================================
   UTILITY
================================================== */

function clone(obj) {

    return JSON.parse(
        JSON.stringify(obj)
    );

}


function uid(prefix) {

    return (
        prefix +
        "_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );

}


function today() {

    return new Date()
        .toISOString()
        .slice(0, 10);

}


function money(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 2
        }
    ).format(
        Number(value) || 0
    ) + " đ";

}


function number(value, digits = 0) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: digits
        }
    ).format(
        Number(value) || 0
    );

}


function projectionMoney(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 0
        }
    ).format(
        Math.round(
            Number(value) || 0
        )
    ) + " đ";

}


function projectionNumber(value) {

    return new Intl.NumberFormat(
        "vi-VN",
        {
            maximumFractionDigits: 0
        }
    ).format(
        Math.round(
            Number(value) || 0
        )
    );

}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(
            /[&<>"']/g,
            char => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char])
        );

}


function daysBetween(start, end) {

    if (!start || !end) {
        return 0;
    }

    const a =
        new Date(
            start + "T00:00:00"
        );

    const b =
        new Date(
            end + "T00:00:00"
        );

    return Math.max(
        0,
        Math.floor(
            (b - a) / 86400000
        )
    );

}


function mergeData(base, source) {

    for (const key in source) {

        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key])
        ) {

            base[key] =
                mergeData(
                    base[key] || {},
                    source[key]
                );

        } else {

            base[key] =
                source[key];

        }

    }

    return base;

}


/* ==================================================
   STORAGE
================================================== */

function loadData() {

    try {

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!saved) {

            return clone(
                DEFAULT_DATA
            );

        }

        return mergeData(
            clone(DEFAULT_DATA),
            JSON.parse(saved)
        );

    } catch (error) {

        console.error(error);

        return clone(
            DEFAULT_DATA
        );

    }

}


function saveData() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
    );

    renderAll();

}


/* ==================================================
   TOAST
================================================== */

function toast(message) {

    const el =
        document.getElementById(
            "toast"
        );

    if (!el) return;

    el.textContent =
        message;

    el.classList.add("show");

    clearTimeout(
        window.__toastTimer
    );

    window.__toastTimer =
        setTimeout(
            () => {
                el.classList.remove(
                    "show"
                );
            },
            2500
        );

}


/* ==================================================
   FEE
================================================== */

function calculateTradingFee(amount) {

    return (
        Number(amount) || 0
    ) *
    (
        Number(
            data.settings.fee
        ) || 0
    ) /
    100;

}


/* ==================================================
   DEPOSIT
================================================== */

function addDeposit(form) {

    const amount =
        Number(
            form.amount.value
        );

    if (amount <= 0) {

        throw new Error(
            "Số tiền nạp phải lớn hơn 0."
        );

    }

    data.deposits.push({

        id:
            uid("deposit"),

        date:
            form.date.value || today(),

        amount,

        note:
            form.note.value.trim()

    });

    saveData();

    form.reset();

    form.date.value =
        today();

    toast(
        "Đã nạp tiền."
    );

}


/* ==================================================
   SYMBOL
================================================== */

function getSymbols() {

    const symbols =
        new Set();

    data.transactions.forEach(
        t => {

            if (t.symbol)
                symbols.add(
                    t.symbol
                );

        }
    );

    data.dividends.forEach(
        d => {

            if (d.symbol)
                symbols.add(
                    d.symbol
                );

        }
    );

    return Array.from(
        symbols
    ).sort();

}


/* ==================================================
   FIFO
================================================== */

function replaySymbol(symbol) {

    const events = [];


    data.transactions
        .filter(
            t =>
                t.symbol === symbol
        )
        .forEach(
            t => {

                events.push({

                    ...t,

                    eventType:
                        t.type

                });

            }
        );


    data.dividends
        .filter(
            d =>
                d.symbol === symbol &&
                d.type !== "cash" &&
                Number(
                    d.receivedQty
                ) > 0
        )
        .forEach(
            d => {

                events.push({

                    id:
                        d.id,

                    date:
                        d.payDate,

                    symbol,

                    eventType:
                        "stockDividend",

                    qty:
                        Number(
                            d.receivedQty
                        ) || 0,

                    price: 0

                });

            }
        );


    events.sort(
        (a, b) => {

            const result =
                String(a.date)
                    .localeCompare(
                        String(b.date)
                    );

            if (result !== 0)
                return result;

            const priority = {

                stockDividend: 0,

                buy: 1,

                sell: 2

            };

            return (
                (priority[a.eventType] ?? 1) -
                (priority[b.eventType] ?? 1)
            );

        }
    );


    const lots = [];


    for (
        const event of events
    ) {

        if (
            event.eventType === "buy"
        ) {

            lots.push({

                id:
                    event.id,

                date:
                    event.date,

                qty:
                    Number(
                        event.qty
                    ) || 0,

                price:
                    Number(
                        event.price
                    ) || 0

            });

        }


        else if (
            event.eventType ===
            "stockDividend"
        ) {

            lots.push({

                id:
                    uid("divlot"),

                date:
                    event.date,

                qty:
                    Number(
                        event.qty
                    ) || 0,

                price: 0

            });

        }


        else if (
            event.eventType === "sell"
        ) {

            let remaining =
                Number(
                    event.qty
                ) || 0;


            for (
                const lot of lots
            ) {

                if (
                    remaining <= 0
                )
                    break;


                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );


                lot.qty -=
                    take;

                remaining -=
                    take;

            }


            if (
                remaining >
                0.000001
            ) {

                throw new Error(
                    `Không đủ ${symbol} để bán.`
                );

            }

        }

    }


    return lots.filter(
        lot =>
            lot.qty >
            0.000001
    );

}


function getHoldingLots(symbol) {

    return replaySymbol(
        symbol
    );

}


function getHoldingQuantity(symbol) {

    return getHoldingLots(
        symbol
    ).reduce(
        (sum, lot) =>
            sum + lot.qty,
        0
    );

}


/* ==================================================
   HOLDING AT RECORD DATE
================================================== */

function getHoldingAtDate(
    symbol,
    date
) {

    const events = [];


    data.transactions
        .filter(
            t =>
                t.symbol === symbol &&
                t.date <= date
        )
        .forEach(
            t => {

                events.push({

                    date:
                        t.date,

                    type:
                        t.type,

                    qty:
                        Number(
                            t.qty
                        ) || 0

                });

            }
        );


    data.dividends
        .filter(
            d =>
                d.symbol === symbol &&
                d.type !== "cash" &&
                d.payDate <= date
        )
        .forEach(
            d => {

                events.push({

                    date:
                        d.payDate,

                    type:
                        "stockDividend",

                    qty:
                        Number(
                            d.receivedQty
                        ) || 0

                });

            }
        );


    events.sort(
        (a, b) =>
            String(a.date)
                .localeCompare(
                    String(b.date)
                )
    );


    const lots = [];


    for (
        const event of events
    ) {

        if (
            event.type === "buy" ||
            event.type === "stockDividend"
        ) {

            lots.push({

                qty:
                    event.qty

            });

        }


        else if (
            event.type === "sell"
        ) {

            let remaining =
                event.qty;


            for (
                const lot of lots
            ) {

                if (
                    remaining <= 0
                )
                    break;


                const take =
                    Math.min(
                        lot.qty,
                        remaining
                    );


                lot.qty -=
                    take;

                remaining -=
                    take;

            }

        }

    }


    return lots.reduce(
        (sum, lot) =>
            sum + lot.qty,
        0
    );

}


/* ==================================================
   CASH
================================================== */

function calculateCash() {

    let cash = 0;


    data.deposits.forEach(
        d => {

            cash +=
                Number(
                    d.amount
                ) || 0;

        }
    );


    data.transactions.forEach(
        t => {

            if (
                t.type === "buy" &&
                t.source === "cash"
            ) {

                cash -=
                    Number(
                        t.total
                    ) || 0;

            }


            if (
                t.type === "sell"
            ) {

                cash +=
                    Number(
                        t.net
                    ) || 0;

            }

        }
    );


    return cash;

}


/* ==================================================
   DIVIDEND WALLET
================================================== */

function calculateDividendWallet() {

    let wallet = 0;


    data.dividends
        .filter(
            d =>
                d.type === "cash"
        )
        .forEach(
            d => {

                wallet +=
                    Number(
                        d.cashTotal
                    ) || 0;

            }
        );


    data.transactions
        .filter(
            t =>
                t.type === "buy" &&
                t.source === "dividend"
        )
        .forEach(
            t => {

                wallet -=
                    Number(
                        t.total
                    ) || 0;

            }
        );


    return Math.max(
        0,
        wallet
    );

}


/* ==================================================
   CASH INTEREST
================================================== */

function calculateCashInterest() {

    const events = [];


    data.deposits.forEach(
        d => {

            events.push({

                date:
                    d.date,

                delta:
                    Number(
                        d.amount
                    ) || 0

            });

        }
    );


    data.transactions.forEach(
        t => {

            if (
                t.type === "buy" &&
                t.source === "cash"
            ) {

                events.push({

                    date:
                        t.date,

                    delta:
                        -Number(
                            t.total
                        )

                });

            }


            if (
                t.type === "sell"
            ) {

                events.push({

                    date:
                        t.date,

                    delta:
                        Number(
                            t.net
                        )

                });

            }

        }
    );


    if (
        events.length === 0
    )
        return 0;


    events.sort(
        (a, b) =>
            String(a.date)
                .localeCompare(
                    String(b.date)
                )
    );


    let balance = 0;

    let interest = 0;

    let previous =
        events[0].date;


    for (
        const event of events
    ) {

        const days =
            daysBetween(
                previous,
                event.date
            );


        if (days > 0) {

            interest +=
                Math.max(
                    0,
                    balance
                ) *
                (
                    Number(
                        data.settings.interest
                    ) || 0
                ) /
                100 *
                days /
                365;

        }


        balance +=
            event.delta;

        previous =
            event.date;

    }


    const finalDays =
        daysBetween(
            previous,
            today()
        );


    interest +=
        Math.max(
            0,
            balance
        ) *
        (
            Number(
                data.settings.interest
            ) || 0
        ) /
        100 *
        finalDays /
        365;


    return Math.max(
        0,
        interest
    );

}


/* ==================================================
   CUSTODY
================================================== */

function calculateCustodyFee() {

    if (
        !data.settings.custodyEnabled
    )
        return 0;


    let total = 0;


    for (
        const symbol of getSymbols()
    ) {

        const lots =
            getHoldingLots(
                symbol
            );


        lots.forEach(
            lot => {

                total +=
                    lot.qty *
                    Number(
                        data.settings.custody
                    ) *
                    daysBetween(
                        lot.date,
                        today()
                    );

            }
        );

    }


    return total;

}


/* ==================================================
   PORTFOLIO
================================================== */

function getPortfolio() {

    const result = [];


    getSymbols().forEach(
        symbol => {

            const lots =
                getHoldingLots(
                    symbol
                );


            const quantity =
                lots.reduce(
                    (s, l) =>
                        s + l.qty,
                    0
                );


            const cost =
                lots.reduce(
                    (s, l) =>
                        s +
                        l.qty *
                        l.price,
                    0
                );


            const averageCost =
                quantity
                    ? cost / quantity
                    : 0;


            const cashDividend =
                data.dividends
                    .filter(
                        d =>
                            d.symbol === symbol &&
                            d.type === "cash"
                    )
                    .reduce(
                        (s, d) =>
                            s +
                            Number(
                                d.cashTotal
                            ),
                        0
                    );


            const stockDividend =
                data.dividends
                    .filter(
                        d =>
                            d.symbol === symbol &&
                            d.type !== "cash"
                    )
                    .reduce(
                        (s, d) =>
                            s +
                            Number(
                                d.receivedQty
                            ),
                        0
                    );


            result.push({

                symbol,

                lots,

                quantity,

                cost,

                averageCost,

                cashDividend,

                stockDividend

            });

        }
    );


    return result.filter(
        x =>
            x.quantity > 0 ||
            x.cashDividend > 0 ||
            x.stockDividend > 0
    );

}


/* ==================================================
   ADD TRADE
================================================== */

function addTrade(form) {

    const type =
        form.type.value;

    const date =
        form.date.value;

    const symbol =
        form.symbol.value
            .trim()
            .toUpperCase();

    const qty =
        Number(
            form.qty.value
        );

    const price =
        Number(
            form.price.value
        );

    let source =
        form.source.value;


    if (
        !date ||
        !symbol ||
        qty <= 0 ||
        price < 0
    ) {

        throw new Error(
            "Kiểm tra thông tin giao dịch."
        );

    }


    if (
        type === "sell"
    ) {

        source = "cash";

    }


    const value =
        qty *
        price;


    const fee =
        calculateTradingFee(
            value
        );


    const total =
        value +
        fee;


    if (
        type === "buy"
    ) {

        if (
            source === "cash" &&
            calculateCash() < total
        ) {

            throw new Error(
                "Không đủ tiền mặt."
            );

        }


        if (
            source === "dividend" &&
            calculateDividendWallet() < total
        ) {

            throw new Error(
                "Không đủ ví cổ tức."
            );

        }


        data.transactions.push({

            id:
                uid("tx"),

            type:
                "buy",

            date,

            symbol,

            qty,

            price,

            fee,

            total,

            source,

            note:
                form.note.value.trim()

        });

    }


    else {

        const holding =
            getHoldingQuantity(
                symbol
            );


        if (
            holding < qty
        ) {

            throw new Error(
                `Không đủ ${symbol} để bán.`
            );

        }


        const net =
            value -
            fee;


        data.transactions.push({

            id:
                uid("tx"),

            type:
                "sell",

            date,

            symbol,

            qty,

            price,

            fee,

            total:
                value,

            net,

            source:
                "cash",

            note:
                form.note.value.trim()

        });

    }


    try {

        getSymbols()
            .forEach(
                s =>
                    getHoldingLots(s)
            );

    } catch (error) {

        data.transactions.pop();

        throw error;

    }


    saveData();

    resetTradeForm();

    toast(
        type === "buy"
            ? "Đã mua cổ phiếu."
            : "Đã bán cổ phiếu."
    );

}


/* ==================================================
   DIVIDEND
================================================== */

function addDividend(form) {

    const symbol =
        form.symbol.value
            .trim()
            .toUpperCase();

    const type =
        form.type.value;

    const recordDate =
        form.recordDate.value;

    const payDate =
        form.payDate.value;


    if (
        !symbol ||
        !recordDate ||
        !payDate
    ) {

        throw new Error(
            "Thiếu thông tin cổ tức."
        );

    }


    const eligible =
        Math.floor(
            getHoldingAtDate(
                symbol,
                recordDate
            )
        );


    if (
        eligible <= 0
    ) {

        throw new Error(
            `Không có ${symbol} đủ điều kiện nhận cổ tức.`
        );

    }


    const dividend = {

        id:
            uid("dividend"),

        symbol,

        type,

        recordDate,

        payDate,

        eligible,

        note:
            form.note.value.trim()

    };


    if (
        type === "cash"
    ) {

        const perShare =
            Number(
                form.cashPerShare.value
            );


        if (
            perShare <= 0
        ) {

            throw new Error(
                "Cổ tức / CP phải lớn hơn 0."
            );

        }


        dividend.cashPerShare =
            perShare;

        dividend.cashTotal =
            eligible *
            perShare;

    }


    else {

        const base =
            Number(
                form.ratioBase.value
            );

        const newShares =
            Number(
                form.ratioNew.value
            );


        if (
            base <= 0 ||
            newShares < 0
        ) {

            throw new Error(
                "Tỷ lệ cổ phiếu không hợp lệ."
            );

        }


        dividend.ratioBase =
            base;

        dividend.ratioNew =
            newShares;

        dividend.receivedQty =
            Math.floor(
                eligible *
                newShares /
                base
            );

    }


    data.dividends.push(
        dividend
    );

    saveData();

    form.reset();

    form.recordDate.value =
        today();

    form.payDate.value =
        today();

    form.ratioBase.value =
        10;

    form.ratioNew.value =
        1;

    toggleDividendFields();

    toast(
        "Đã lưu cổ tức."
    );

}


/* ==================================================
   DELETE
================================================== */

function deleteTransaction(id) {

    if (
        !confirm(
            "Xóa giao dịch này?"
        )
    )
        return;


    const backup =
        clone(data);


    data.transactions =
        data.transactions.filter(
            t =>
                t.id !== id
        );


    try {

        getSymbols()
            .forEach(
                s =>
                    getHoldingLots(s)
            );

        saveData();

        toast(
            "Đã xóa giao dịch."
        );

    } catch (error) {

        data =
            backup;

        saveData();

        alert(
            error.message
        );

    }

}


function deleteDividend(id) {

    if (
        !confirm(
            "Xóa quyền cổ tức này?"
        )
    )
        return;


    data.dividends =
        data.dividends.filter(
            d =>
                d.id !== id
        );


    saveData();

    toast(
        "Đã xóa cổ tức."
    );

}


/* ==================================================
   DASHBOARD
================================================== */

function renderDashboard() {

    const portfolio =
        getPortfolio();


    const deposits =
        data.deposits.reduce(
            (s, d) =>
                s +
                Number(d.amount),
            0
        );


    const cash =
        calculateCash();


    const wallet =
        calculateDividendWallet();


    const invested =
        portfolio.reduce(
            (s, p) =>
                s + p.cost,
            0
        );


    const dividend =
        data.dividends
            .filter(
                d =>
                    d.type === "cash"
            )
            .reduce(
                (s, d) =>
                    s +
                    Number(
                        d.cashTotal
                    ),
                0
            );


    const cards = [

        ["Tổng tiền nạp",
            money(deposits)],

        ["Tiền mặt",
            money(cash)],

        ["Ví cổ tức",
            money(wallet)],

        ["Tiền khả dụng",
            money(cash + wallet)],

        ["Vốn cổ phiếu",
            money(invested)],

        ["Cổ tức tiền mặt",
            money(dividend)],

        ["Lãi tiền mặt",
            money(calculateCashInterest())],

        ["Phí lưu ký",
            money(calculateCustodyFee())]

    ];


    const element =
        document.getElementById(
            "dashboardCards"
        );


    if (!element)
        return;


    element.innerHTML =
        cards.map(
            card => `

                <div class="stat">

                    <div class="label">
                        ${card[
