/**
 * @license
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function log(what) {
  console.log(what);
  var div = document.getElementById('log');
  div.innerHTML += '<div>' + what + '</div>';
}

function initListeners() {
  window.onerror = function(event) {
    if (event.message) {
      log(event.message + ' // ' + event.filename + ':' + event.lineno + '@' +
          event.colno);
    } else {
      log(event);
    }
  };
}

var sessionID;

function initSession() {
  /**
   * Generates a GUID string, according to RFC4122 standards.
   * @returns {String} The generated GUID.
   * @example af8a84166e18a307bd9cf2c947bbb3aa
   * @author Slavik Meltser (slavik@meltser.info).
   * @link http://slavik.meltser.info/?p=142
   */
  function _p8(s) {
    var p = (Math.random().toString(16) + '000000000').substr(2, 8);
    return s ? p.substr(0, 4) + p.substr(4, 4) : p;
  }
  sessionID = window.location.href.split('testid=')[1] ||
      _p8() + _p8(true) + _p8(true) + _p8();
  log('Session ID: ' + sessionID);
}

var manifestUri =
    'https://storage.googleapis.com/ytlr-cert.appspot.com/test-materials/media/manual/wv_license_request.mpd';
var licenseServer = 'https://cwip-shaka-proxy.appspot.com/no_auth';
var re_ua =
    /([-.A-Za-z0-9\\\/]*)_([-.A-Za-z0-9\\\/]*)_([-.A-Za-z0-9\\\/]*) ?\/ ?[-_.A-Za-z0-9\\]* \(([-_.A-Za-z0-9\\\/ ]+), ?([^,]*), ?([WIREDLSwiredls\\\/]*)\)/;
var useragentParsed = re_ua.exec(navigator.userAgent);
var ua_brand = useragentParsed ? useragentParsed[4] :
                                 'Error! User agent is not in correct format';
var ua_model = useragentParsed ? useragentParsed[5] :
                                 'Error! User agent is not in correct format';
var useragentValid = re_ua.exec(navigator.userAgent)

function initApp() {
  initListeners();
  initSession();

  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    log('Browser not supported!');
  }
}

function renderLicense(license) {
  var should = {company_name: ua_brand, model_name: ua_model};
  var licenseData = '';
  for (var key in license) {
    licenseData += '<br/><strong>' + key + ': </strong>' + (license[key] || '');
    if (should[key]) {
      licenseData += ' <i>(should be: ' + should[key] + ')</i>';
    }
  }
  var div = document.getElementById('wv_data');
  div.innerHTML = licenseData;
}

function initPlayer() {
  // Create a Player instance.
  var video = document.getElementById('video');
  video.textTracks = [];
  video.addTextTrack = function() {
    return {
      addCue: function() {}
    }
  };
  var player = new shaka.Player(video);

  // Attach player to the window to make it easy to access in the JS console.
  window.player = player;

  // Listen for error events.
  player.addEventListener('error', function(event) {
    log('shaka error ' + event.detail);
  });

  // Try to load a manifest.
  // This is an asynchronous process.

  player.configure({drm: {servers: {'com.widevine.alpha': licenseServer}}});
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    // Only manipulate license requests:
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      // This is the raw license request generated by the Widevine CDM.
      var rawLicenseRequest = new Uint8Array(request.body);
      var license = {};
      // Encode the raw license request in base64.
      var rawLicenseRequestBase64 = base64js.fromByteArray(rawLicenseRequest);
      log('license request: ' + rawLicenseRequestBase64);
      license.company_name = null;
      license.model_name = null;

      renderLicense(license);

      var xhr = new XMLHttpRequest();
      url = 'https://proxy.uat.widevine.com/proxy?get_client_id=true';
      xhr.open('POST', url, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          try {
            if (xhr.status != 200) {
              log('failed, HTTP status ' + xhr.status);
            } else {
              console.log(xhr.responseText);
              parsedLicenseRequest = JSON.parse(xhr.responseText);
              client_info = parsedLicenseRequest.client_info;
              for (var i = 0; i < client_info.length; i++) {
                key = client_info[i].name;
                value = client_info[i].value;
                license[key] = value;
              }
            }
            if(parsedLicenseRequest.client_capabilities) {
              license['oem_crypto_api_version'] = parsedLicenseRequest.client_capabilities.oem_crypto_api_version || 'Error: OEMCrypto version missing!';
              license['max_hdcp_version'] = parsedLicenseRequest.client_capabilities.max_hdcp_version || 'Error: Max HDCP version missing!';
            }
            renderLicense(license);
          } catch (e) {}
        }
      };
      xhr.send(rawLicenseRequest);
    }
  });
  player.load(manifestUri).then(function() {}).catch(function(error) {
    log('Load error ' + error);
  });
}