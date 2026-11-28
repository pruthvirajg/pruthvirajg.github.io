(function () {
  "use strict";
  var billing = "monthly";

  // ---- pricing toggle ----
  var toggles = document.querySelectorAll("[data-billing]");
  function setBilling(b) {
    billing = b;
    toggles.forEach(function (t) { t.setAttribute("aria-pressed", String(t.dataset.billing === b)); });
    document.querySelectorAll(".plan").forEach(function (card) {
      var amt = card.querySelector("[data-amount]");
      var per = card.querySelector("[data-per]");
      var note = card.querySelector(".per-year");
      var btn = card.querySelector("[data-plan-btn]");
      var m = card.dataset.monthly, y = card.dataset.yearly, cur = card.dataset.currency;
      if (b === "yearly") {
        amt.textContent = cur + y; per.textContent = "/year";
        note.textContent = "That's " + cur + (y / 12).toFixed(2) + " a month";
      } else {
        amt.textContent = cur + m; per.textContent = "/month";
        note.textContent = " ";
      }
      var url = b === "yearly" ? card.dataset.checkoutYearly : card.dataset.checkoutMonthly;
      btn.href = url || "#join";
      btn.textContent = url ? "Get " + card.dataset.name : "Join for " + card.dataset.name;
    });
  }
  toggles.forEach(function (t) { t.addEventListener("click", function () { setBilling(t.dataset.billing); }); });
  if (toggles.length) setBilling("monthly");

  // a plan button without a checkout link pre-fills the waitlist form
  document.querySelectorAll("[data-plan-btn]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.getAttribute("href") !== "#join") return;
      var form = document.getElementById("waitlist");
      if (!form) return;
      form.plan.value = btn.closest(".plan").dataset.plan;
      form.billing.value = billing;
    });
  });

  // ---- waitlist ----
  var form = document.getElementById("waitlist");
  if (!form) return;
  var msg = form.querySelector(".msg");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.email.value.trim();
    msg.className = "msg";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msg.textContent = "Please enter a valid email."; msg.classList.add("err"); form.email.focus(); return;
    }
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true; msg.textContent = "Adding you…";
    fetch("api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email, plan: form.plan.value, billing: form.billing.value,
        instagram: form.instagram.value.trim(), website: form.website.value
      })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          msg.textContent = res.j.message || "You're on the list. Check your inbox soon.";
          msg.classList.add("ok"); form.reset();
        } else {
          msg.textContent = (res.j && res.j.error) || "Something went wrong. Please try again.";
          msg.classList.add("err");
        }
      })
      .catch(function () { msg.textContent = "Couldn't reach the server. Please try again."; msg.classList.add("err"); })
      .finally(function () { btn.disabled = false; });
  });
})();
