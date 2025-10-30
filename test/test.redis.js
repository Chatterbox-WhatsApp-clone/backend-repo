
import { createClient } from 'redis';

const client = createClient({
	username: "default",
	password: "q4QvEw1vJ9tNwbFStQLvIR54nw8TMtaU",
	socket: {
		host: "redis-19417.c232.us-east-1-2.ec2.redns.redis-cloud.com",
		port: 19417,
	},
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log(result)  