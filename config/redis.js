const redis = require('redis');

let client ;
const connectRedis = async ()=>{
    client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
            reconnectStrategy: (retries) => {
                if(retries>10)return new Error("Unable to connect to Redis");
                    return Math.min(retries * 100, 3000)
            }
        }
    });
    client.on("connect",()=>console.log("Connected to Redis successfully"));
    client.on("error",(err)=>{
        console.error("Redis Client Error", err);
    });
    await client.connect();

};
const getRedis =()=>{
    if(!client){
        throw new Error("Redis client is not initialized");
    }
    return client;
};
module.exports = {
    connectRedis,
    getRedis
}