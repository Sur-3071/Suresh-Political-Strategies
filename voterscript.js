import {
  setupFirebaseListener,
  fetchInitialFirebaseData,
  saveVoterField,
  setFirebaseVillagePath
} from "./Voterfirebase-service.js";

// =====================================
// VILLAGE JSON FILE MAPPING
// =====================================
// Map dropdown values to their respective JSON files in your data/ folder
const VILLAGE_JSON_MAP = {
  "Sampathnagaram": "data/sampathnagaram.json",
  "Pathathungapadu": "data/pathathungapadu.json",
};

// =====================================
// HTML ELEMENTS
// =====================================

const villageSelect = document.getElementById("villageSelect");
const activeVillageTitle = document.getElementById("activeVillageTitle");
const wardSelect = document.getElementById("wardSelect");
const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
const voterTable = document.getElementById("voterTable");

const count = document.getElementById("count");
const emptyMessage = document.getElementById("emptyMessage");
const status = document.getElementById("status");

const familyContainer = document.getElementById("familyContainer");
const familyCount = document.getElementById("familyCount");

const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadVerificationPdfBtn =
  document.getElementById("downloadVerificationPdfBtn");

// =====================================
// STORE DATA
// =====================================

let currentVillage = villageSelect ? villageSelect.value : "Sampathnagaram";
let allWards = {};
let allVoters = [];
let voters = [];

let verificationData = {};
let partyData = {};
let unsubscribeFirebaseListener = null;

// =====================================
// UNIQUE VOTER IDENTIFICATION
// =====================================

function getVoterKey(voter) {
  const ward = String(voter.ward_number ?? "").trim();
  const voterId = String(voter.voter_id_no ?? "").trim().toUpperCase();
  const voterNo = String(voter.voter_no ?? "").trim();

  let rawKey = "";
  if (voterId) {
    rawKey = "ID_" + voterId;
  } else if (voterNo) {
    rawKey = "WARD_" + ward + "_NO_" + voterNo;
  } else {
    rawKey = [
      "WARD_" + ward,
      "NAME_" + String(voter.voter_name ?? "").trim().toUpperCase(),
      "HOUSE_" + String(voter.house_no ?? "").trim().toUpperCase()
    ].join("_");
  }

  return rawKey.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

function isVerified(voter) {
  return verificationData[getVoterKey(voter)] === true;
}

function isMyParty(voter) {
  return partyData[getVoterKey(voter)] === true;
}

function normalizeGender(genderValue) {
  const gender = String(genderValue || "").trim().toLowerCase();
  if (gender === "male" || gender === "m") return "male";
  if (gender === "female" || gender === "f") return "female";
  return "other";
}

// =====================================
// LOAD JSON & INIT FIREBASE BY VILLAGE
// =====================================

async function loadVotersForVillage(villageName) {
  try {
    currentVillage = villageName;
    status.hidden = true;
    count.textContent = "Loading...";
    if (activeVillageTitle) {
      activeVillageTitle.textContent = `${villageName} — Ward Wise Voter Directory`;
    }

    // Reset state before loading new village
    allWards = {};
    allVoters = [];
    voters = [];
    verificationData = {};
    partyData = {};
    voterTable.innerHTML = "";

    // 1. Clean up existing Firebase listener from previous village
    if (typeof unsubscribeFirebaseListener === "function") {
      unsubscribeFirebaseListener();
      unsubscribeFirebaseListener = null;
    }

    // 2. Point Firebase service to the selected village node
    const firebaseNodePath = `voter_directory_records/${villageName}`;
    setFirebaseVillagePath(firebaseNodePath);

    // 3. Start live listener for real-time updates on this village
    unsubscribeFirebaseListener = setupFirebaseListener((newVerification, newParty) => {
      verificationData = newVerification;
      partyData = newParty;
      if (allVoters.length > 0) {
        displayVoters();
      }
    });

    // 4. Determine JSON path for the selected village
    const jsonFilePath =
      VILLAGE_JSON_MAP[villageName] || `data/${villageName.toLowerCase()}.json`;

    // 5. Fetch JSON records and initial Firebase snapshot concurrently
    const [response, initialFirebase] = await Promise.all([
      fetch(jsonFilePath),
      fetchInitialFirebaseData()
    ]);

    verificationData = initialFirebase.verificationData;
    partyData = initialFirebase.partyData;

    if (!response.ok) {
      throw new Error(`Unable to load ${jsonFilePath}`);
    }

    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Invalid JSON structure");
    }

    allWards = data;
    allVoters = [];

    Object.entries(allWards).forEach(([wardKey, records]) => {
      if (!Array.isArray(records)) return;
      records.forEach(voter => {
        if (!voter || typeof voter !== "object") return;
        allVoters.push({
          ...voter,
          ward_number: voter.ward_number ?? Number(wardKey)
        });
      });
    });

    createWardOptions();
    wardSelect.value = "ALL";
    searchInput.value = "";
    filterRecords();

  } catch (error) {
    console.error(error);
    allWards = {};
    allVoters = [];
    voters = [];
    voterTable.innerHTML = "";
    count.textContent = "0 Records";
    status.hidden = false;
    status.textContent = `Unable to load voter data for ${villageName}. Ensure ${VILLAGE_JSON_MAP[villageName] || "the JSON file"} exists.`;
    emptyMessage.hidden = false;
    emptyMessage.textContent = "Unable to load voter records.";

    // Reset dashboard counters to 0 on error
    updateStatistics([]);
    updateVerificationDashboard([]);
    updateWardSummary([]);
    updateVoterToMeSummary([]);
    updateFamilyGroups([]);
  }
}

// =====================================
// UI RENDERING & EVENT HANDLERS
// =====================================

function createWardOptions() {
  wardSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "ALL";
  allOption.textContent = "All Wards";
  wardSelect.appendChild(allOption);

  Object.keys(allWards)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(ward => {
      const option = document.createElement("option");
      option.value = ward;
      option.textContent = "Ward " + ward;
      wardSelect.appendChild(option);
    });
}

function filterRecords() {
  const selectedWard = wardSelect.value;
  voters = selectedWard === "ALL"
    ? [...allVoters]
    : allVoters.filter(v => String(v.ward_number) === selectedWard);
  displayVoters();
}

function updateStatistics(records) {
  const total = records.length;
  const male = records.filter(v => normalizeGender(v.gender) === "male").length;
  const female = records.filter(v => normalizeGender(v.gender) === "female").length;

  document.getElementById("totalVoters").textContent = total.toLocaleString("en-IN");
  document.getElementById("maleCount").textContent = male.toLocaleString("en-IN");
  document.getElementById("femaleCount").textContent = female.toLocaleString("en-IN");
}

function updateVerificationDashboard(records) {
  const total = records.length;
  let verified = 0, maleTotal = 0, maleVerified = 0, femaleTotal = 0, femaleVerified = 0;

  records.forEach(voter => {
    const gender = normalizeGender(voter.gender);
    const isVer = isVerified(voter);
    if (isVer) verified++;
    if (gender === "male") {
      maleTotal++;
      if (isVer) maleVerified++;
    } else if (gender === "female") {
      femaleTotal++;
      if (isVer) femaleVerified++;
    }
  });

  const pending = total - verified;
  const percentage = total > 0 ? (verified / total) * 100 : 0;

  document.getElementById("verifiedCount").textContent = verified.toLocaleString("en-IN");
  document.getElementById("pendingCount").textContent = pending.toLocaleString("en-IN");
  document.getElementById("verificationPercentage").textContent = percentage.toFixed(1) + "%";
  document.getElementById("verificationProgress").style.width = percentage + "%";

  document.getElementById("maleVerifiedCount").textContent = `${maleVerified.toLocaleString("en-IN")} / ${maleTotal.toLocaleString("en-IN")}`;
  document.getElementById("malePendingText").textContent = `${(maleTotal - maleVerified).toLocaleString("en-IN")} Pending`;

  document.getElementById("femaleVerifiedCount").textContent = `${femaleVerified.toLocaleString("en-IN")} / ${femaleTotal.toLocaleString("en-IN")}`;
  document.getElementById("femalePendingText").textContent = `${(femaleTotal - femaleVerified).toLocaleString("en-IN")} Pending`;
}

function updateWardSummary(records) {
  const tbody = document.getElementById("wardSummaryTable");
  tbody.innerHTML = "";
  const wardMap = {};

  records.forEach(voter => {
    const ward = String(voter.ward_number ?? "Unknown");
    if (!wardMap[ward]) wardMap[ward] = { total: 0, verified: 0 };
    wardMap[ward].total++;
    if (isVerified(voter)) wardMap[ward].verified++;
  });

  Object.entries(wardMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([ward, stats]) => {
      const pending = stats.total - stats.verified;
      const percentage = stats.total > 0 ? (stats.verified / stats.total) * 100 : 0;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>Ward ${ward}</td>
        <td>${stats.total.toLocaleString("en-IN")}</td>
        <td>${stats.verified.toLocaleString("en-IN")}</td>
        <td>${pending.toLocaleString("en-IN")}</td>
        <td>${percentage.toFixed(1)}%</td>
      `;
      tbody.appendChild(row);
    });
}

function updateVoterToMeSummary(records) {
  const tbody = document.getElementById("voterToMeTable");
  tbody.innerHTML = "";
  const wardMap = {};

  let grandTotal = 0, grandMyTotal = 0, grandMyMale = 0, grandMyFemale = 0;
  let grandOtherTotal = 0, grandOtherMale = 0, grandOtherFemale = 0;

  records.forEach(voter => {
    const ward = String(voter.ward_number ?? "Unknown");
    const gender = normalizeGender(voter.gender);
    const myParty = isMyParty(voter);

    if (!wardMap[ward]) {
      wardMap[ward] = { total: 0, myTotal: 0, myMale: 0, myFemale: 0, otherTotal: 0, otherMale: 0, otherFemale: 0 };
    }

    wardMap[ward].total++;
    grandTotal++;

    if (myParty) {
      wardMap[ward].myTotal++;
      grandMyTotal++;
      if (gender === "male") { wardMap[ward].myMale++; grandMyMale++; }
      else if (gender === "female") { wardMap[ward].myFemale++; grandMyFemale++; }
    } else {
      wardMap[ward].otherTotal++;
      grandOtherTotal++;
      if (gender === "male") { wardMap[ward].otherMale++; grandOtherMale++; }
      else if (gender === "female") { wardMap[ward].otherFemale++; grandOtherFemale++; }
    }
  });

  document.getElementById("totalMyPartyBadge").textContent = `My Party: ${grandMyTotal.toLocaleString("en-IN")}`;
  document.getElementById("totalOtherPartyBadge").textContent = `Another Party: ${grandOtherTotal.toLocaleString("en-IN")}`;

  Object.entries(wardMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([ward, stats]) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>Ward ${ward}</td>
        <td>${stats.total.toLocaleString("en-IN")}</td>
        <td>${stats.myTotal.toLocaleString("en-IN")}</td>
        <td>${stats.myMale.toLocaleString("en-IN")}</td>
        <td>${stats.myFemale.toLocaleString("en-IN")}</td>
        <td>${stats.otherTotal.toLocaleString("en-IN")}</td>
        <td>${stats.otherMale.toLocaleString("en-IN")}</td>
        <td>${stats.otherFemale.toLocaleString("en-IN")}</td>
      `;
      tbody.appendChild(row);
    });

  const totalRow = document.createElement("tr");
  totalRow.className = "summary-total-row";
  totalRow.innerHTML = `
    <td>Total</td>
    <td>${grandTotal.toLocaleString("en-IN")}</td>
    <td>${grandMyTotal.toLocaleString("en-IN")}</td>
    <td>${grandMyMale.toLocaleString("en-IN")}</td>
    <td>${grandMyFemale.toLocaleString("en-IN")}</td>
    <td>${grandOtherTotal.toLocaleString("en-IN")}</td>
    <td>${grandOtherMale.toLocaleString("en-IN")}</td>
    <td>${grandOtherFemale.toLocaleString("en-IN")}</td>
  `;
  tbody.appendChild(totalRow);
}

function updateFamilyGroups(records) {
  familyContainer.innerHTML = "";
  const familyMap = {};

  records.forEach(voter => {
    const voterName = String(voter.voter_name || "").trim();
    if (!voterName) return;
    const parts = voterName.split(/\s+/);
    const surname = parts[parts.length - 1].toUpperCase();

    if (!familyMap[surname]) familyMap[surname] = { male: 0, female: 0, total: 0 };
    const gender = normalizeGender(voter.gender);
    if (gender === "male") familyMap[surname].male++;
    else if (gender === "female") familyMap[surname].female++;
    familyMap[surname].total++;
  });

  const families = Object.entries(familyMap).sort((a, b) => b[1].total - a[1].total);
  familyCount.textContent = families.length.toLocaleString("en-IN") + " Families";

  if (families.length === 0) {
    familyContainer.innerHTML = `<div class="family-empty">No Family Groups Found</div>`;
    return;
  }

  families.forEach(([surname, stats]) => {
    const card = document.createElement("div");
    card.className = "family-card";
    card.innerHTML = `
      <div class="family-name">${surname} Family</div>
      <div class="family-stats">
        <div class="family-item"><span>Male</span><strong class="family-male">${stats.male}</strong></div>
        <div class="family-item"><span>Female</span><strong class="family-female">${stats.female}</strong></div>
      </div>
      <div class="family-total">Total Members : ${stats.total}</div>
    `;
    familyContainer.appendChild(card);
  });
}

function displayVoters() {
  const search = searchInput.value.trim().toLowerCase();
  const filteredVoters = voters
    .filter(voter => {
      const fields = [
        voter.voter_name, voter.voter_no, voter.voter_id_no,
        voter.relation_type, voter.relation_name, voter.house_no,
        voter.gender, voter.age, voter.ward_number
      ];
      return fields.some(val => String(val ?? "").toLowerCase().includes(search));
    })
    .sort((a, b) => String(a.voter_no || "").localeCompare(String(b.voter_no || ""), undefined, { numeric: true }));

  voterTable.innerHTML = "";

  filteredVoters.forEach((voter, index) => {
    const row = document.createElement("tr");
    const voterKey = getVoterKey(voter);
    const myParty = isMyParty(voter);
    const verified = isVerified(voter);

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${voter.ward_number ?? "-"}</td>
      <td>${voter.voter_no ?? "-"}</td>
      <td>${voter.voter_id_no ?? "-"}</td>
      <td>${voter.voter_name ?? "-"}</td>
      <td>${voter.relation_type ?? "-"}</td>
      <td>${voter.relation_name ?? "-"}</td>
      <td>${voter.age ?? "-"}</td>
      <td>${voter.gender ?? "-"}</td>
      <td>${voter.house_no ?? "-"}</td>
      <td class="no-print"><button type="button" class="party-btn ${myParty ? "my-party" : "another-party"}" data-action="toggle-party" data-voter-key="${voterKey}">${myParty ? "★ My Party" : "Another Party"}</button></td>
      <td class="no-print"><button type="button" class="verification-btn ${verified ? "verified" : "pending"}" data-action="toggle-verify" data-voter-key="${voterKey}">${verified ? "✓ Verified" : "Pending"}</button></td>
    `;
    voterTable.appendChild(row);
  });

  const activeWardRecords = wardSelect.value === "ALL" ? allVoters : voters;
  updateStatistics(filteredVoters);
  updateVerificationDashboard(filteredVoters);
  updateWardSummary(activeWardRecords);
  updateVoterToMeSummary(activeWardRecords);
  updateFamilyGroups(filteredVoters);

  count.textContent = filteredVoters.length.toLocaleString("en-IN") + " Records";
  document.getElementById("grandTotal").textContent = filteredVoters.length.toLocaleString("en-IN");
  emptyMessage.hidden = filteredVoters.length !== 0;
}

// =====================================
// EVENTS & LISTENERS
// =====================================

voterTable.addEventListener("click", event => {
  const button = event.target.closest("button[data-voter-key]");
  if (!button) return;

  const key = button.dataset.voterKey;
  const action = button.dataset.action;
  if (!key) return;

  if (action === "toggle-party") {
    const newPartyState = !(partyData[key] === true);
    partyData[key] = newPartyState;
    displayVoters();
    saveVoterField(key, "isMyParty", newPartyState);
  } else if (action === "toggle-verify") {
    const newVerifyState = !(verificationData[key] === true);
    verificationData[key] = newVerifyState;
    displayVoters();
    saveVoterField(key, "isVerified", newVerifyState);
  }
});

// Village Dropdown Change Event
if (villageSelect) {
  villageSelect.addEventListener("change", event => {
    const selectedVillage = event.target.value;
    loadVotersForVillage(selectedVillage);
  });
}

wardSelect.addEventListener("change", () => {
  searchInput.value = "";
  filterRecords();
});

searchInput.addEventListener("input", displayVoters);

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  displayVoters();
  searchInput.focus();
});

// PDF Export Handlers (Included with dynamic village filename)
if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", () => {
    const element = document.getElementById("pdfContent");
    const opt = {
      margin: 0.4,
      filename: `${currentVillage}_Voter_Report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "landscape" }
    };
    html2pdf().set(opt).from(element).save();
  });
}

if (downloadVerificationPdfBtn) {
  downloadVerificationPdfBtn.addEventListener("click", () => {
    const element = document.getElementById("pdfContent");
    const opt = {
      margin: 0.4,
      filename: `${currentVillage}_Verification_Summary.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "landscape" }
    };
    html2pdf().set(opt).from(element).save();
  });
}

// Initialize with default selected village
loadVotersForVillage(currentVillage);