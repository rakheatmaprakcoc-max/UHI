<%@ WebHandler Language="C#" Class="WfsProxy" %>

using System;
using System.Net;
using System.Web;

// Deploy this file to the IIS site alongside index.html (e.g. /Rak/wfs-proxy.ashx).
// It forwards WFS GetFeature requests to the TUM so2sat GeoServer from the IIS
// server's own network/IP (which the GeoServer allowlists) and adds the CORS
// header the browser needs when the front end is served from GitHub Pages.
public class WfsProxy : IHttpHandler {

    private const string WfsBase = "https://tubvsig-so2sat-vm1.srv.mwn.de/geoserver/ows";
    private const string AllowOrigin = "*";

    public bool IsReusable { get { return false; } }

    public void ProcessRequest(HttpContext context) {
        var response = context.Response;
        var request = context.Request;

        response.Headers.Set("Access-Control-Allow-Origin", AllowOrigin);
        response.Headers.Set("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.Headers.Set("Access-Control-Allow-Headers", "Content-Type");

        if (request.HttpMethod == "OPTIONS") {
            response.StatusCode = 204;
            return;
        }

        var targetUrl = WfsBase + request.Url.Query;

        var upstream = (HttpWebRequest)WebRequest.Create(targetUrl);
        upstream.Method = "GET";
        upstream.Timeout = 30000;
        // Some upstream firewalls allowlist by Referer rather than IP; send one
        // matching the site this proxy is deployed on, just in case.
        upstream.Referer = request.Url.GetLeftPart(UriPartial.Authority) + "/";

        try {
            using (var upstreamResponse = (HttpWebResponse)upstream.GetResponse())
            using (var stream = upstreamResponse.GetResponseStream()) {
                response.ContentType = upstreamResponse.ContentType ?? "application/json";
                stream.CopyTo(response.OutputStream);
            }
        } catch (WebException ex) {
            var upstreamResponse = ex.Response as HttpWebResponse;
            response.StatusCode = upstreamResponse != null ? (int)upstreamResponse.StatusCode : 502;
            response.ContentType = "text/plain";
            response.Write("WFS proxy error: " + ex.Message);
        }
    }
}
