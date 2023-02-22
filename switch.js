const readline          = require('readline')
const fs                = require('fs')
const path              = require('path')
const http              = require('http')
const querystring       = require('querystring')
const dataQueue         = []
const batchInfo         = {
    pageIndex: 1,
    pageSize: 1,
    count: 0
}
const crontab           = require('node-cron')
const config            = require('./config')

function switchAtt (eids) {
    return new Promise ((resolve, reject) => {
        let httpReq = http.request({
            hostname: config.hostname,
            method: 'POST',
            path: '/smartatt-clock/manage/deactivate',
            headers: {
                'Content-Type': 'application/json',
                '__signtoken': config.token
            },
        }, httpRes => {
            let bufferArr = []
            let size = 0
            httpRes.on('data', (chunk) => {
                bufferArr.push(chunk)
                size += chunk.length
            });
            httpRes.on('end', () => {
                try {
                    let resData = JSON.parse((Buffer.concat(bufferArr, size)).toString());
                    if (resData.success == true) {
                        console.log('切换请求成功收到回包 %s', JSON.stringify(resData));
                    } else {
                        handleError(JSON.stringify(resData));
                    }
                } catch (e) {
                    handleError(e);
                }
            });
        });
        httpReq.on('error', (e) => {
            handleError(e);
        });
        httpReq.end(JSON.stringify({
            disableAssist: true,
            eids: eids,
            enableSmartAtt: true,
            jumpStatsPage: true,
            replaceOldAtt: true
        }));
    })
}

function handleError (e) {
    console.error(e)
}

// 分批次
async function batch () {
    const rl = readline.createInterface({
        input: fs.createReadStream(path.resolve(__dirname, './switch.txt')),
        outpu: process.stdout
    })
    for await (const eid of rl) {
        dataQueue.push(eid)
    }
    batchInfo.count = Math.ceil(dataQueue.length/batchInfo.pageSize)
    console.log("当前切换队列执行eid共计: %s 条, 需执行 %s 批次", dataQueue.length, batchInfo.count)
}

// 定时执行
async function init () {
    await batch()
    const task = crontab.schedule("*/15 * * * * *", async function () {
        let eids = dataQueue.slice((batchInfo.pageIndex - 1) * batchInfo.pageSize, batchInfo.pageIndex * batchInfo.pageSize)
        console.log("当前切换执行第 %s 批，工作圈为：%s", batchInfo.pageIndex, JSON.stringify(eids))
        switchAtt(eids)
        batchInfo.pageIndex++
        if (batchInfo.pageIndex > batchInfo.count) {
            console.log('******切换应用定时任务over******')
        }
    })
}
init()
