const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");

const {grant_type,response_type,redirect_uri,client_id, client_secret, scope} = require("./auth/credentials.json");

const host = "localhost" // Side note localhost can also be accessed using IPv6 with [::1]:3000
const port = 3000;
let title="";
const server = http.createServer();
server.on("request", request_handler);
server.on("listening", listen_handler);
server.listen(port);

function listen_handler(){
	console.log(`Now Listening on Port ${port}`);
}
function request_handler(req, res){
    console.log(req.url);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if(req.url.startsWith("/search")){
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        console.log(user_input);
        const id = user_input.get('id');
        if(id == null || id== "" ){
            not_found(res);
        } 
        else{
            const aic_api = https.request(`https://api.artic.edu/api/v1/artworks/${id}?fields=id,title,image_id`);
            aic_api.on("response" , aic_res => process_stream(aic_res, parse_results, res));
            aic_api.end();
        }
    }
    else if (req.url.startsWith("/start")) {
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        const code = user_input.get("code");
        console.log(code);
        if (code === undefined ) {
            not_found(res);
            return;
        }
        send_access_token_request(code, res);
    } 
    else{
        not_found(res);
    }
}

function not_found(res) {
    res.writeHead(404, {"Content-Type": "text/html"});
    res.end(`<h1>404 Not Found</h1>`);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function parse_results(data, res){
    const iiif2 = JSON.parse(data);
	let results = "<h1>No Results Found</h1>";
    if(iiif2.data!=null){
        let imgID = iiif2.data.image_id;
        title=iiif2.data.title;
        const aic_api2 = https.get(`https://www.artic.edu/iiif/2/${imgID}/full/843,/0/default.jpg`, function(response) {                                                                                          
            response.pipe(fs.createWriteStream(title+".png"));                                                                        
        }).end();
        results="<h1>Found</h1>"
    }else res.end(results);
    const authorization_endpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    let uri = new URLSearchParams({scope,response_type,redirect_uri, client_id}).toString();
    console.log(uri);
    res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`}).end();
}

function send_access_token_request(code, res) {
    const token_endpoint = "https://accounts.google.com/o/oauth2/token?";
    let post_data = new URLSearchParams({grant_type,redirect_uri,client_id, client_secret, code}).toString();
    console.log(post_data);
    let options = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };
    https.request(token_endpoint, options, 
        (token_stream) => process_stream(token_stream, receive_access_token, res)
    ).end(post_data);
}

function receive_access_token(body, res) {
    const {access_token} = JSON.parse(body);
    upload_file(access_token, res);
}

function upload_file(access_token, res) {
    console.log(access_token);
    const task_endpoint = "https://www.googleapis.com/upload/drive/v3/files?uploadType=media";
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "image/jpeg",
            Authorization: `Bearer ${access_token}`,
        },
    };
    const post_data = fs.createReadStream(title+".png");
    const upload_req = https.request(task_endpoint, options);
    post_data.pipe(upload_req);
    upload_req.on("response",(stream) => process_stream(stream, receive_respond, res));
}

function receive_respond(body,res) {
    res.writeHead(302, {Location: `https://drive.google.com/drive/my-drive`}).end();
}