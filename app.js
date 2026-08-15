// ---------- Firebase setup ----------
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---------- Helpers ----------
const KES = (n) => `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthKey(dateStr) {
  // dateStr: "YYYY-MM-DD" -> "YYYY-MM"
  return dateStr.slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function last6MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonth = monthKey(todayISO());

document.getElementById("currentMonthLabel").textContent = monthLabel(currentMonth);
document.getElementById("currentMonthLabel2").textContent = monthLabel(currentMonth);
document.getElementById("dailyDate").value = todayISO();
document.getElementById("monthlyDate").value = todayISO();

// ---------- State ----------
let currentIncome = 0;
let currentExpenses = []; // entries for the current month
let chart = null;

// ---------- Income ----------
db.collection("income").doc(currentMonth).onSnapshot((doc) => {
  currentIncome = doc.exists ? Number(doc.data().amount) : 0;
  document.getElementById("incomeInput").value = currentIncome || "";
  renderSummary();
});

document.getElementById("saveIncomeBtn").addEventListener("click", async () => {
  const val = Number(document.getElementById("incomeInput").value);
  if (!val || val < 0) return;
  try {
    await db.collection("income").doc(currentMonth).set({ amount: val });
  } catch (err) {
    console.error("Failed to save income:", err);
    alert("Couldn't save income: " + err.message);
  }
});

// ---------- Expenses ----------
db.collection("expenses")
  .where("month", "==", currentMonth)
  .onSnapshot((snap) => {
    currentExpenses = [];
    snap.forEach((doc) => currentExpenses.push({ id: doc.id, ...doc.data() }));
    currentExpenses.sort((a, b) => (a.date < b.date ? 1 : -1));
    renderEntries();
    renderSummary();
  });

async function addExpense({ type, category, amount, date, note }) {
  try {
    await db.collection("expenses").add({
      type, category, amount: Number(amount), date, month: monthKey(date), note: note || ""
      type, category, amountKES: Number(amount), date, month: monthKey(date)
    });
  } catch (err) {
    console.error("Failed to add expense:", err);
    alert("Couldn't save expense: " + err.message);
  }
}

async function deleteExpense(id) {
  await db.collection("expenses").doc(id).delete();
}

function renderEntries() {
  const body = document.getElementById("entriesBody");
  const empty = document.getElementById("emptyState");
  body.innerHTML = "";
  empty.style.display = currentExpenses.length ? "none" : "block";

  currentExpenses.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.date}</td>
      <td>${e.category}</td>
      <td>${e.type}</td>
      <td class="num amount-debit">− ${KES(e.amount)}</td>
      <td class="col-action"><button class="row-delete" title="Delete entry">✕</button></td>
    `;
    tr.querySelector(".row-delete").addEventListener("click", () => deleteExpense(e.id));
    body.appendChild(tr);
  });
}

function renderSummary() {
  const total = currentExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const target = currentIncome * 0.15;
  const balance = currentIncome - total;

  document.getElementById("sumIncome").textContent = KES(currentIncome);
  document.getElementById("sumExpenses").textContent = KES(total);
  document.getElementById("sumTarget").textContent = KES(target);
  document.getElementById("sumBalance").textContent = KES(balance);

  const verdict = document.getElementById("savingsVerdict");
  if (!currentIncome) {
    verdict.textContent = "Set your income to see a savings target. ";//🚀

  } else if (balance >= target) {
    const pct = ((balance / currentIncome) * 100).toFixed(1);
    verdict.textContent = `On track — you're positioned to save ${pct}% this month.`;
    verdict.style.color = "#A9D6C1";
  } else {
    verdict.textContent = `Short of the 15% target by ${KES(target - balance)}.`;
    verdict.style.color = "#E8B7A2";
  }
}

// ---------- Chart: income vs expenses, last 6 months ----------
async function renderChart() {
  const months = last6MonthKeys();

  const incomeSnaps = await Promise.all(
    months.map((m) => db.collection("income").doc(m).get())
  );
  const incomeByMonth = months.map((m, i) => (incomeSnaps[i].exists ? Number(incomeSnaps[i].data().amount) : 0));

  const expenseSnap = await db.collection("expenses")
    .where("month", "in", months.length > 10 ? months.slice(0, 10) : months)
    .get();

  const expenseByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  expenseSnap.forEach((doc) => {
    const d = doc.data();
    if (expenseByMonth[d.month] !== undefined) expenseByMonth[d.month] += Number(d.amount);
  });

  const labels = months.map((m) => monthLabel(m).split(" ")[0]);

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("incomeExpenseChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Income", data: incomeByMonth, backgroundColor: "#6FA88A" },
        { label: "Expenses", data: months.map((m) => expenseByMonth[m]), backgroundColor: "#B5502E" }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#EDEAE0" } } },
      scales: {
        x: { ticks: { color: "#9FB0C4" }, grid: { color: "rgba(237,234,224,0.08)" } },
        y: { ticks: { color: "#9FB0C4" }, grid: { color: "rgba(237,234,224,0.08)" }, beginAtZero: true }
      }
    }
  });
}
renderChart();

// re-draw the chart whenever an expense changes, so it stays live
db.collection("expenses").onSnapshot(() => renderChart());

// ---------- Modals ----------
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

document.getElementById("openDailyBtn").addEventListener("click", () => openModal("dailyModal"));
document.getElementById("openMonthlyBtn").addEventListener("click", () => openModal("monthlyModal"));

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.getElementById("dailyForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await addExpense({
    type: "daily",
    category: document.getElementById("dailyCategory").value,
    amount: document.getElementById("dailyAmount").value,
    date: document.getElementById("dailyDate").value
  });
  ev.target.reset();
  document.getElementById("dailyDate").value = todayISO();
  closeModal("dailyModal");
});

document.getElementById("monthlyForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await addExpense({
    type: "monthly",
    category: document.getElementById("monthlyCategory").value,
    amount: document.getElementById("monthlyAmount").value,
    date: document.getElementById("monthlyDate").value
  });
  ev.target.reset();
  document.getElementById("monthlyDate").value = todayISO();
  closeModal("monthlyModal");
});