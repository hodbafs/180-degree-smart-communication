/**
 * 180-Degree Smart Communication Assessment Backend (Code.gs)
 * 
 * ระบบบันทึกผลคะแนนประเมินตรงเข้าแผ่นงาน "ชีต1" โดยค้นหาแถวที่ตรงตามเงื่อนไข:
 * 1. อีเมลผู้ประเมิน (คอลัมน์ B)
 * 2. อีเมลผู้ถูกประเมิน (คอลัมน์ E)
 * 3. บทบาทผู้ประเมิน (คอลัมน์ C)
 * 
 * ลิงก์สเปรดชีตหลัก:
 * https://docs.google.com/spreadsheets/d/10aPk9ZdN9e5-eY1l0x-sTn2VkA_TEMK4GKAd7lLOhYw/edit
 */

// ตรวจสอบความถูกต้องและเปรียบเทียบบทบาทระหว่างข้อมูลจากระบบกับข้อมูลในสเปรดชีตแบบยืดหยุ่น
function isRoleMatch(sheetRole, payloadRole) {
  if (!sheetRole || !payloadRole) return false;
  var s = sheetRole.toString().trim().toLowerCase();
  var p = payloadRole.toString().trim().toLowerCase();
  
  if (p === "self") {
    return s.indexOf("ตนเอง") !== -1 || s.indexOf("self") !== -1;
  }
  if (p === "manager") {
    return s.indexOf("หัวหน้า") !== -1 || s.indexOf("manager") !== -1 || s.indexOf("boss") !== -1 || s.indexOf("direct") !== -1;
  }
  if (p === "peer") {
    return s.indexOf("เพื่อน") !== -1 || s.indexOf("peer") !== -1;
  }
  return s === p;
}

// แปลงบทบาทภาษาอังกฤษของระบบเป็นภาษาไทยหลัก
function getRoleThai(role) {
  if (role === "Self") return "ตนเอง";
  if (role === "Manager") return "หัวหน้างาน";
  if (role === "Peer") return "เพื่อนร่วมงาน";
  return role;
}

// จัดการคำขอแบบ POST (บันทึกข้อมูลและเขียนทับลงแถวเดิมใน "ชีต1")
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // รอคิวเขียนข้อมูลสูงสุด 15 วินาที
    lock.waitLock(15000);
    
    var payload = JSON.parse(e.postData.contents);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // เพิ่มฟีเจอร์ Reset ระบบทั้งหมด
    if (payload.action === "reset") {
      var sheet = ss.getSheetByName("ชีต1") || ss.getSheets()[0];
      if (sheet) {
        var lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          // ล้างข้อมูลคอลัมน์ F (สถานะ) ถึง AA (วันที่ส่ง)
          // คอลัมน์ F คือ 6, AA คือ 27 -> ทั้งหมด 22 คอลัมน์
          sheet.getRange(2, 6, lastRow - 1, 22).clearContent();
        }
      }
      
      var rawSheet = ss.getSheetByName("180_Smart_Communication_Raw_Dat");
      if (rawSheet) {
        var lastRowRaw = rawSheet.getLastRow();
        if (lastRowRaw >= 2) {
          rawSheet.deleteRows(2, lastRowRaw - 1);
        }
      }

      // บันทึกเวลาที่รีเซ็ตล่าสุด
      PropertiesService.getScriptProperties().setProperty('LAST_RESET', new Date().getTime().toString());
      
      return ContentService.createTextOutput(JSON.stringify({
        "status": "success",
        "message": "ระบบสเปรดชีตได้รับการรีเซ็ตเป็นค่าเริ่มต้นเรียบร้อยแล้ว"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // เพิ่มฟีเจอร์ Reset รายบุคคล (เฉพาะแถว)
    if (payload.action === "reset_row") {
      var targetEmail = payload.targetEmail.trim().toLowerCase();
      var sheet = ss.getSheetByName("ชีต1") || ss.getSheets()[0];
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var rTargetEmail = data[i][4] ? data[i][4].toString().trim().toLowerCase() : "";
          if (rTargetEmail === targetEmail) {
            sheet.getRange(i + 1, 6, 1, 22).clearContent();
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "status": "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // เพิ่มฟีเจอร์ Reset เฉพาะรายการ (Task)
    if (payload.action === "reset_task") {
      var targetEmail = payload.targetEmail.trim().toLowerCase();
      var evaluatorEmail = payload.evaluatorEmail.trim().toLowerCase();
      var role = payload.role;
      var sheet = ss.getSheetByName("ชีต1") || ss.getSheets()[0];
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var rEvaluatorEmail = data[i][1] ? data[i][1].toString().trim().toLowerCase() : "";
          var rTargetEmail = data[i][4] ? data[i][4].toString().trim().toLowerCase() : "";
          var rRole = data[i][2] ? data[i][2].toString().trim() : "";
          if (rEvaluatorEmail === evaluatorEmail && rTargetEmail === targetEmail && isRoleMatch(rRole, role)) {
            sheet.getRange(i + 1, 6, 1, 22).clearContent();
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "status": "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var targetEmail = payload.targetEmail.trim().toLowerCase();
    var evaluatorEmail = payload.evaluatorEmail.trim().toLowerCase();
    var role = payload.role; // 'Self', 'Manager', 'Peer'
    var answers = payload.answers; // { "1": 5, "2": 4, ... }
    var comment = payload.comment || "";
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ชีต1") || ss.getSheets()[0]; // ใช้ชีตแรก หรือ ชีต1
    
    if (!sheet) {
      throw new Error("ไม่พบแผ่นงาน 'ชีต1' หรือแผ่นงานเริ่มต้นในสเปรดชีต");
    }
    
    var data = sheet.getDataRange().getValues();
    var foundRowIndex = -1; // 0-based index
    
    // ค้นหาแถวที่มี อีเมลผู้ประเมิน + อีเมลผู้ถูกประเมิน + บทบาท ตรงกัน
    for (var i = 1; i < data.length; i++) {
      var rEvaluatorEmail = data[i][1] ? data[i][1].toString().trim().toLowerCase() : ""; // คอลัมน์ B (อีเมลผู้ประเมิน)
      var rTargetEmail = data[i][4] ? data[i][4].toString().trim().toLowerCase() : "";    // คอลัมน์ E (อีเมลผู้ถูกประเมิน)
      var rRole = data[i][2] ? data[i][2].toString().trim() : "";                        // คอลัมน์ C (บทบาทผู้ประเมิน)
      
      if (rEvaluatorEmail === evaluatorEmail && rTargetEmail === targetEmail && isRoleMatch(rRole, role)) {
        foundRowIndex = i;
        break;
      }
    }
    
    if (foundRowIndex === -1) {
      throw new Error("ไม่พบรายชื่อในระบบประเมินที่ตรงกับ ผู้ประเมิน: " + evaluatorEmail + ", ผู้ถูกประเมิน: " + targetEmail + ", บทบาท: " + getRoleThai(role));
    }
    
    var rowNum = foundRowIndex + 1; // 1-based index ใน Google Sheets
    
    // 1. อัปเดตสถานะการประเมิน (คอลัมน์ F หรือ คอลัมน์ที่ 6) เป็น "Complete"
    sheet.getRange(rowNum, 6).setValue("Complete");
    
    // 2. อัปเดตผลคะแนนข้อที่ 1-19 (คอลัมน์ G ถึง Y หรือ คอลัมน์ที่ 7 ถึง 25)
    var scoreValues = [];
    for (var qId = 1; qId <= 19; qId++) {
      var val = answers[qId] !== undefined ? answers[qId] : "";
      if (val !== "" && val !== "N/A") {
        scoreValues.push(Number(val));
      } else {
        scoreValues.push(val);
      }
    }
    sheet.getRange(rowNum, 7, 1, 19).setValues([scoreValues]);
    
    // 3. อัปเดตความคิดเห็นเพิ่มเติม (คอลัมน์ Z หรือ คอลัมน์ที่ 26)
    sheet.getRange(rowNum, 26).setValue(comment);
    
    // 4. อัปเดตวันที่ส่งประเมิน (คอลัมน์ AA หรือ คอลัมน์ที่ 27)
    sheet.getRange(rowNum, 27).setValue(new Date());
    
    // [ทางเลือกเสริม] บันทึกสำรองข้อมูลประวัติการส่งลงแผ่นงาน "180_Smart_Communication_Raw_Dat"
    var rawSheet = ss.getSheetByName("180_Smart_Communication_Raw_Dat");
    if (rawSheet) {
      var targetName = payload.targetName || (data[foundRowIndex][3] ? data[foundRowIndex][3].toString().trim() : "");
      var evaluatorName = payload.evaluatorName || (data[foundRowIndex][0] ? data[foundRowIndex][0].toString().trim() : "");
      
      var rawRowData = [
        evaluatorName,
        evaluatorEmail,
        getRoleThai(role),
        targetName,
        targetEmail,
        "Complete"
      ];
      for (var qId = 1; qId <= 19; qId++) {
        var score = answers[qId] !== undefined ? answers[qId] : "";
        rawRowData.push(score);
      }
      rawRowData.push(comment);
      rawRowData.push(new Date());
      rawSheet.appendRow(rawRowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "บันทึกผลการประเมินลงในสเปรดชีตแถวที่ " + rowNum + " สำเร็จ"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// จัดการคำขอแบบ GET (ดึงข้อมูลแถวที่มีสถานะเป็น Complete เพื่อระบุวิชาที่ทำเสร็จแล้วบนแดชบอร์ด)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ชีต1") || ss.getSheets()[0];
    var completedList = [];
    
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
        // Index 1: อีเมลผู้ประเมิน, Index 2: บทบาทผู้ประเมิน, Index 4: อีเมลผู้ถูกประเมิน, Index 5: สถานะการประเมิน
        for (var r = 0; r < data.length; r++) {
          var status = data[r][5] ? data[r][5].toString().trim().toLowerCase() : "";
          if (status !== "complete" && status !== "completed") {
            continue;
          }
          
          var roleThai = data[r][2] ? data[r][2].toString().trim() : "";
          var role = roleThai;
          
          if (roleThai.indexOf("ตนเอง") !== -1 || roleThai.toLowerCase().indexOf("self") !== -1) {
            role = "Self";
          } else if (roleThai.indexOf("หัวหน้า") !== -1 || roleThai.toLowerCase().indexOf("manager") !== -1 || roleThai.toLowerCase().indexOf("boss") !== -1 || roleThai.toLowerCase().indexOf("direct") !== -1) {
            role = "Manager";
          } else if (roleThai.indexOf("เพื่อน") !== -1 || roleThai.toLowerCase().indexOf("peer") !== -1) {
            role = "Peer";
          }
          
          completedList.push({
            evaluatorEmail: data[r][1] ? data[r][1].toString().trim().toLowerCase() : "",
            targetEmail: data[r][4] ? data[r][4].toString().trim().toLowerCase() : "",
            role: role
          });
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "completed": completedList,
      "lastReset": PropertiesService.getScriptProperties().getProperty('LAST_RESET')
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
