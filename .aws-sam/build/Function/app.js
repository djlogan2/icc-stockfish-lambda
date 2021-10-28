// const axios = require('axios')
// const url = 'http://checkip.amazonaws.com/';
const fs = require('fs');
const Engine = require("node-uci").Engine;
const { Chess } = require("chess.js");

let response;
let engine;
function dome() {
    if(!!engine) return Promise.resolve();
    return new Promise(resolve => {
        fs.copyFileSync("stockfish_20011801_x64_modern", "/tmp/stockfish_20011801_x64_modern");
        fs.chmodSync("/tmp/stockfish_20011801_x64_modern", 0o755);
        engine = new Engine("/tmp/stockfish_20011801_x64_modern");
        resolve();
    });
}

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
exports.lambdaHandler = async (event, context) => {
    try {
        console.log(event);
        await dome();
        // const ret = await axios(url);
        let final_result = {timing: {start: new Date(), moves: []}};
        const init_result = await engine.init();
        final_result.startup = {id: {...init_result.id}, options: Object.fromEntries(init_result.options)};
        //const event = JSON.parse(event.body);

        if(event.options) {
            for(const key in event.options) {
                if(event.options.hasOwnProperty(key)) {
                    console.log("setoption " + key + " " + event.options[key]);
                    await engine.setoption(key, event.options[key].toString());
                    await engine.isready();
                }
            }
            console.log('engine ready', engine.id, engine.options)
            await engine.ucinewgame();
            await engine.isready();

            if(event.position) {
                console.log("position " + event.position);
                await engine.position(event.position);
                await engine.isready();
            }
            console.log("go " + JSON.stringify(event.gooptions));

            const move_timing = {start: new Date()};
            const result = await engine.go(event.gooptions);
            console.log("result=" + JSON.stringify(result));
            move_timing.end = new Date();
            final_result.timing.moves.push(move_timing);

            if(!!event.moves) {
                final_result.results = [result];
                const chess = new Chess(event.position || null);
                while(event.moves.length) {
                    const move = event.moves.shift();
                    chess.move(move);
                    console.log("position " + chess.fen() + " (after move " + move + ")");
                    await engine.position(chess.fen());
                    await engine.isready();
                    console.log("go " + JSON.stringify(event.gooptions));
                    const move_timing = {start: new Date()};
                    const result2 = await engine.go(event.gooptions);
                    move_timing.end = new Date();
                    final_result.timing.moves.push(move_timing);
                    final_result.results.push(result2);
                }
            } else
                final_result.results = result;
        }
        await engine.quit();
        final_result.timing.end = new Date();
        response = {
            'statusCode': 200,
            'body': JSON.stringify(final_result)
        }
    } catch (err) {
        console.log(err);
        if(!err)
            err = "Unknown error occurred";
        response = {
            'statusCode': 400,
            'body': JSON.stringify(err)
        }
        try {engine.quit();}catch(e){} // just eat any errors here
    }

    return response
};


/*
{
    options: {}, // optional -- sets threads, multipv, skill level, etc.
    position: "fen", // optional -- sets an initial position
    moves: [] // optional -- For each move, if we are analyzing an entire game
    gooptions: {} // required -- The stockfish go options
}
 */
