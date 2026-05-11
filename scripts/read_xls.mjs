import fs from 'fs';
import * as XLSX from 'xlsx';

const buf = fs.readFileSync('Excel Template v2.xls');
const workbook = XLSX.read(buf, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('First 15 rows:');
for (let i = 0; i < Math.min(15, dataAsArray.length); i++) {
    console.log(`Row ${i}:`, dataAsArray[i]);
}

const dataAsObj = XLSX.utils.sheet_to_json(worksheet);
console.log('First 2 Objects:', dataAsObj.slice(0, 2));
