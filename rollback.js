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

function rollbackAtt (eids) {
    return new Promise ((resolve, reject) => {
        let httpReq = http.request({
            hostname: config.hostname,
            method: 'POST',
            path: '/smartatt-clock/manage/restartAtt',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
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
                        console.log('回滚请求成功收到回包 %s', JSON.stringify(resData));
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
        httpReq.end(querystring.stringify({
            eids: eids.join(',')
        }));
    })
}

function handleError (e) {
    console.error(e)
}

// 分批次
async function batch () {
    const rl = readline.createInterface({
        input: fs.createReadStream(path.resolve(__dirname, './rollback.txt')),
        outpu: process.stdout
    })
    for await (const eid of rl) {
        dataQueue.push(eid)
    }
    batchInfo.count = Math.ceil(dataQueue.length/batchInfo.pageSize)
    console.log("当前回滚队列执行eid共计: %s 条, 需执行 %s 批次", dataQueue.length, batchInfo.count)
}

// 定时执行
async function init () {
    await batch()
    const task = crontab.schedule("*/15 * * * * *", async function () {
        let eids = dataQueue.slice((batchInfo.pageIndex - 1) * batchInfo.pageSize, batchInfo.pageIndex * batchInfo.pageSize)
        console.log("当前回滚执行第 %s 批，工作圈为：%s", batchInfo.pageIndex, JSON.stringify(eids))
        rollbackAtt(eids)
        batchInfo.pageIndex++
        if (batchInfo.pageIndex > batchInfo.count) {
            console.log('******切换应用定时任务over******')
        }
    })
}
init()
