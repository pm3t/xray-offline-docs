import net from 'net';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const MAWB = '111-222333';
const HAWB = 'HAWB999';
const TIMESTAMP = Date.now();
const FILE_NAME = `${MAWB}_${HAWB}_${TIMESTAMP}.jpg`;

// Create a dummy image
writeFileSync(FILE_NAME, 'dummy-image-data-test-camera');

console.log('Sending TCP payload...');
const client = new net.Socket();
client.connect(1337, '127.0.0.1', () => {
    const payload = `${MAWB}_${HAWB}_${TIMESTAMP}`;
    console.log(`Sending: ${payload}`);
    client.write(payload);
    client.destroy();

    console.log('Sending FTP file upload...');
    const curlCmd = `curl -T ${FILE_NAME} ftp://127.0.0.1:2121/ --user anonymous:`;
    exec(curlCmd, (error, stdout, stderr) => {
        if (error) {
            console.error('FTP Error:', error.message);
        } else {
            console.log('FTP Upload complete.');
        }
        try { unlinkSync(FILE_NAME); } catch(e){}
    });
});
