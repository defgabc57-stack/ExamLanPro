/**
 * Allow browser POSTs only from the actual host users visited or from APP_URL.
 * Next may internally use 0.0.0.0 even when the browser uses localhost:3001.
 * Do not compare Origin directly to new URL(req.url).host.
 */
export function isAllowedOrigin({origin,host,requestUrl,appUrl}={}){
  // Browsers send Origin on fetch POST. Keep legacy non-browser clients working.
  if(origin==null||origin==='')return true;
  try{
    const source=new URL(origin);
    if(!['http:','https:'].includes(source.protocol)||source.origin!==origin)return false;

    // Host comes from the original HTTP request, unlike the rewritten req.url.
    if(host && !/[\s\/\\@?#]/.test(host)){
      const browserHost=new URL('http://'+host);
      const protocol=requestUrl?new URL(requestUrl).protocol:source.protocol;
      if(browserHost.host===source.host && source.protocol===protocol)return true;
    }

    // Trusted configured public URL covers HTTPS proxies with internal HTTP.
    if(appUrl && new URL(appUrl).origin===source.origin)return true;
  }catch{
    // Invalid or opaque origin: reject rather than skip the check.
  }
  return false;
}
