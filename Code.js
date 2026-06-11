/**
 * 180-Degree Smart Communication Assessment - Google Apps Script Backend
 * Paste this into the Apps Script editor (Code.gs)
 */

function doGet(e) {
  // 1. Handle GET API calls from local files (CORS-friendly GET endpoints)
  if (e && e.parameter && e.parameter.action) {
    var action = e.parameter.action;
    var result;
    
    try {
      if (action === "getNamelist") {
        result = getNamelist();
      } else if (action === "getQuestions") {
        result = getQuestions();
      } else if (action === "getResponses") {
        result = getResponses();
      } else if (action === "submit") {
        var payload = JSON.parse(e.parameter.payload);
        result = submitAssessment(payload);
      } else {
        result = { "error": "Invalid action" };
      }
    } catch(err) {
      result = { "error": err.message };
    }
    
    // Return JSON output (Google Apps Script ContentService allows cross-origin GET requests)
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 2. Otherwise serve the HTML Web App (loads instantly using SSR)
  var template = HtmlService.createTemplateFromFile('index');
  
  var namelist = getNamelist();
  var questions = getQuestions();
  var responses = getResponses();
  
  template.initialNamelist = JSON.stringify(namelist);
  template.initialQuestions = JSON.stringify(questions);
  template.initialResponses = JSON.stringify(responses);
  
  return template.evaluate()
    .setTitle('ระบบประเมิน 180 องศา - Smart Communication')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Handle POST API calls from local files
 */
function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    result = submitAssessment(payload);
  } catch(err) {
    result = { "error": err.message };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the list of users and their tasks from the "Namelist" sheet
 */
function getNamelist() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Namelist");
  if (!sheet) {
    throw new Error("ไม่พบแผ่นงานชื่อ 'Namelist' กรุณาสร้างขึ้นมาก่อน");
  }
  var data = sheet.getDataRange().getValues();
  var rows = [];
  
  rows.push({
    "A": "No", "B": "Name", "C": "Email", "D": "Assessor Type",
    "E": "Assessor Name", "F": "Assessor Email", "G": "Status"
  });
  
  for (var i = 1; i < data.length; i++) {
    rows.push({
      "A": data[i][0].toString(),
      "B": data[i][1].toString(),
      "C": data[i][2].toString(),
      "D": data[i][3].toString(),
      "E": data[i][4].toString(),
      "F": data[i][5].toString(),
      "G": data[i][6].toString()
    });
  }
  return { "rows": rows };
}

/**
 * Gets the 19 questions from the "Questions" sheet
 */
function getQuestions() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Questions");
  if (!sheet) {
    throw new Error("ไม่พบแผ่นงานชื่อ 'Questions' กรุณาสร้างขึ้นมาก่อน");
  }
  var data = sheet.getDataRange().getValues();
  var rows = [];
  
  rows.push({ "A": "", "B": "", "C": "" });
  rows.push({ "A": "ข้อ", "B": "หมวด", "C": "ข้อคำถาม" });
  
  for (var i = 1; i < data.length; i++) {
    rows.push({
      "A": data[i][0].toString(),
      "B": data[i][1].toString(),
      "C": data[i][2].toString()
    });
  }
  return { "rows": rows };
}

/**
 * Gets all submitted responses from the "Responses" sheet
 */
function getResponses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Responses");
  if (!sheet) {
    return [];
  }
  var data = sheet.getDataRange().getValues();
  var responses = [];
  
  for (var i = 1; i < data.length; i++) {
    try {
      responses.push({
        "assessorEmail": data[i][1],
        "targetNo": data[i][2].toString(),
        "role": data[i][3],
        "answers": JSON.parse(data[i][4])
      });
    } catch (e) {
      // Ignore invalid JSON rows
    }
  }
  return responses;
}

/**
 * Submits an assessment, updates the LogData sheet, and returns updated responses
 */
function submitAssessment(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Log Response
  var respSheet = ss.getSheetByName("Responses");
  if (!respSheet) {
    respSheet = ss.insertSheet("Responses");
    respSheet.appendRow(["Timestamp", "Assessor Email", "Target No", "Role", "Answers JSON"]);
  }
  
  var data = respSheet.getDataRange().getValues();
  var existingRowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][1].toString().toLowerCase() === payload.assessorEmail.toLowerCase() &&
        data[i][2].toString() === payload.targetNo.toString() &&
        data[i][3] === payload.role) {
      existingRowIndex = i + 1;
      break;
    }
  }
  
  var answersJson = JSON.stringify(payload.answers);
  if (existingRowIndex > -1) {
    respSheet.getRange(existingRowIndex, 1).setValue(new Date());
    respSheet.getRange(existingRowIndex, 5).setValue(answersJson);
  } else {
    respSheet.appendRow([new Date(), payload.assessorEmail, payload.targetNo, payload.role, answersJson]);
  }
  
  // 2. Update LogData sheet
  updateLogDataExcel(payload.targetNo);
  
  return getResponses();
}

/**
 * Recalculates scores and writes them directly to LogData sheet
 */
function updateLogDataExcel(targetNo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName("LogData");
  if (!logSheet) {
    throw new Error("ไม่พบแผ่นงานชื่อ 'LogData' กรุณาสร้างขึ้นมาก่อน");
  }
  
  var namelist = getNamelist();
  var responses = getResponses();
  
  var targetName = "";
  for (var i = 1; i < namelist.rows.length; i++) {
    if (namelist.rows[i].A === targetNo.toString()) {
      targetName = namelist.rows[i].B;
      break;
    }
  }
  
  if (!targetName) return;

  var columnMap = {
    "สมชาย ใจดี": { "Self": "D", "Manager": "E", "Peer": "F" },
    "พรทิพย์ สวยงาม": { "Self": "G", "Manager": "H", "Peer": "I" },
    "ธีรพล ก้าวหน้า": { "Self": "J", "Manager": "K", "Peer": "L" },
    "กมลวรรณ เด่นไทย": { "Self": "P", "Manager": "Q", "Peer": "R" },
    "ชาญชัย แข็งแรง": { "Self": "S", "Manager": "T", "Peer": "U" },
    "เบญจวรรณ พูนผล": { "Self": "V", "Manager": "W", "Peer": "X" },
    "อดิศักดิ์ รักไทย": { "Self": "Y", "Manager": "Z", "Peer": "AA" },
    "นงนุช เจริญสุข": { "Self": "AB", "Manager": "AC", "Peer": "AD" },
    "ปกรณ์ มีมานะ": { "Self": "AE", "Manager": "AF", "Peer": "AG" },
    "ลลิตา ใฝ่รู้": { "Self": "AH", "Manager": "AI", "Peer": "AJ" }
  };
  
  var cols = columnMap[targetName];
  if (!cols) return;

  var targetResponses = responses.filter(function(res) {
    return res.targetNo.toString() === targetNo.toString();
  });

  for (var q = 1; q <= 19; q++) {
    var rowNum = q + 3;
    
    // A. Self Score
    var selfResp = targetResponses.find(function(res) { return res.role === "Self"; });
    var selfScore = (selfResp && selfResp.answers) ? selfResp.answers[q.toString()] : "";
    logSheet.getRange(cols.Self + rowNum).setValue(selfScore);

    // B. Manager Score
    var mgrResp = targetResponses.find(function(res) { return res.role === "Manager"; });
    var mgrScore = (mgrResp && mgrResp.answers) ? mgrResp.answers[q.toString()] : "";
    logSheet.getRange(cols.Manager + rowNum).setValue(mgrScore);

    // C. Peer Average Score
    var peerResps = targetResponses.filter(function(res) { return res.role.indexOf("Peer") === 0; });
    var peerScores = [];
    peerResps.forEach(function(pr) {
      if (pr.answers) {
        var val = pr.answers[q.toString()];
        if (val !== undefined && val !== "" && val !== "N/A") {
          peerScores.push(parseFloat(val));
        }
      }
    });
    
    var peerAvgStr = "";
    if (peerScores.length > 0) {
      var sum = 0;
      for (var k = 0; k < peerScores.length; k++) {
        sum += peerScores[k];
      }
      var avg = sum / peerScores.length;
      peerAvgStr = avg.toFixed(1);
    }
    logSheet.getRange(cols.Peer + rowNum).setValue(peerAvgStr);
  }
}
