import https from 'node:https';
import {EventEmitter} from 'node:events';
import crypto from 'node:crypto';
import {expect,test,vi} from 'vitest';
import {requestPublicHttps} from '../src/core/linkedin-public.js';
import {createDiscordLinkedInTransport} from '../src/discord/linkedin-transport.js';

test('direct HTTPS never retains server cookies, follows redirects, reads credentials, uses proxies or adds outside headers',async()=>{
 const calls:{url:URL;options:https.RequestOptions}[]=[];
 const spy=vi.spyOn(https,'request').mockImplementation(((url:URL,options:https.RequestOptions,callback:(response:EventEmitter)=>void)=>{
  calls.push({url,options});
  const request=new EventEmitter();Object.assign(request,{end(){const response=new EventEmitter();Object.assign(response,{statusCode:302,headers:{location:'https://www.linkedin.com/login','set-cookie':['anonymous=server-cookie']},destroy(){}});callback(response);response.emit('data',Buffer.from('<html>redirect</html>'));response.emit('end');},destroy(){}});return request;
 }) as typeof https.request);
 const previous=process.env.HTTPS_PROXY;process.env.HTTPS_PROXY='http://forbidden-proxy.invalid';
 try {
  for(const url of ['https://www.linkedin.com/jobs/view/123','https://linkedin.com/jobs/view/123'])expect((await requestPublicHttps(url,'job-ops-public/0.1')).status).toBe(302);
  expect(calls).toHaveLength(2);
  for(const {url,options}of calls){expect(['www.linkedin.com','linkedin.com']).toContain(url.hostname);expect(options.agent).toBe(false);expect(options.auth).toBeUndefined();expect(options.headers).toEqual({'User-Agent':'job-ops-public/0.1',Accept:'text/html'});}
  const credentialed=new URL('https://linkedin.com/jobs/view/123');
  credentialed.username='user';credentialed.password='pass';
  expect(credentialed.hostname).toBe('linkedin.com');expect([credentialed.username,credentialed.password]).toEqual(['user','pass']);
  await expect(requestPublicHttps(credentialed.href,'job-ops-public/0.1')).rejects.toThrow();
  await expect(requestPublicHttps('https://www.indeed.com/jobs/view/123','job-ops-public/0.1')).rejects.toThrow();
  await expect(requestPublicHttps('https://www.linkedin.com/jobs/view/123','job-ops\r\nCookie: outside')).rejects.toThrow();
  expect(calls).toHaveLength(2);
 }finally{spy.mockRestore();if(previous===undefined)delete process.env.HTTPS_PROXY;else process.env.HTTPS_PROXY=previous;}
});
test('scoped production multipart capability sends exact synthetic bytes to validated thread only',async()=>{
 const bytes=Buffer.from('%PDF-1.7\nSynthetic fixture only\n');const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const channelId='12345678901234567';const threadId='12345678901234568';const receipts:{url:string;body?:BodyInit|null}[]=[];const authorize=vi.fn();let rechecks=0;
 const transport=createDiscordLinkedInTransport({token:'synthetic',channelId,linkedinPublicPdfDelivery:true,authorizePublicPdf:authorize,
  fetcher:async(url,init)=>{receipts.push({url:String(url),body:init?.body});return new Response(JSON.stringify(init?.body?{id:'12345678901234569',channel_id:threadId,attachments:[{id:'12345678901234570',filename:'synthetic.pdf',size:bytes.length}]}:{parent_id:channelId,type:11}));}});
 const payload={threadId,key:'synthetic-key',filename:'synthetic.pdf',bytes,sha256,publicDescriptionVersion:'synthetic-version',beforeSend:()=>{rechecks++;}};
 await expect(transport.sendAttachment!(payload)).resolves.toEqual({messageId:'12345678901234569',attachmentId:'12345678901234570'});
 expect(receipts).toHaveLength(2);expect(receipts[1].url).toBe(`https://discord.com/api/v10/channels/${threadId}/messages`);
 const form=receipts[1].body as FormData;expect(Buffer.from(await (form.get('files[0]') as Blob).arrayBuffer())).toEqual(bytes);
 expect(JSON.parse(String(form.get('payload_json'))).allowed_mentions.parse).toEqual([]);expect(rechecks).toBeGreaterThanOrEqual(3);
 expect(authorize).toHaveBeenLastCalledWith({threadId,sha256,descriptionVersion:'synthetic-version'});
 const before=receipts.length;
 await expect(transport.sendAttachment!({...payload,publicDescriptionVersion:undefined})).rejects.toThrow(/authorization/);expect(receipts).toHaveLength(before);
});
