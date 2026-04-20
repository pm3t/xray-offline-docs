const XLSX = require('xlsx');
const workbook = XLSX.readFile('Excel Template v2.xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
console.log('Headers:', data[0]);
