// Milo · runs in YouTube's page (MAIN world) at document_start.
// YouTube's caption files need a token only the player has, so Milo reads the
// player's own /api/timedtext responses and hands them to the content script
// with window.postMessage. Nothing is sent anywhere else, nothing is changed.
;(function () {
  if (window.__MILO_TIMEDTEXT__) return
  window.__MILO_TIMEDTEXT__ = true
  var recent = []
  var LIMIT = 4000000

  function isTimedText(url) {
    return /\/api\/timedtext(\?|$)/.test(String(url || ''))
  }

  function post(item) {
    window.postMessage(
      { milo: 'timedtext', url: item.url, text: item.text },
      location.origin
    )
  }

  function publish(url, text) {
    if (!text || typeof text !== 'string' || text.length > LIMIT) return
    var item = { url: String(url), text: text }
    recent.push(item)
    if (recent.length > 6) recent.shift()
    post(item)
  }

  // The content script may start after the player already loaded captions.
  window.addEventListener('message', function (event) {
    if (
      event.source === window &&
      event.data &&
      event.data.milo === 'timedtext-replay'
    )
      recent.forEach(post)
  })

  var open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (isTimedText(url)) {
        var xhr = this
        xhr.addEventListener('load', function () {
          try {
            if (xhr.status !== 200) return
            var type = xhr.responseType
            var body =
              type === '' || type === 'text'
                ? xhr.responseText
                : type === 'json'
                ? JSON.stringify(xhr.response)
                : type === 'arraybuffer' && window.TextDecoder
                ? new TextDecoder().decode(xhr.response)
                : ''
            publish(xhr.responseURL || url, body)
          } catch (error) {}
        })
      }
    } catch (error) {}
    return open.apply(this, arguments)
  }

  var originalFetch = window.fetch
  if (typeof originalFetch === 'function')
    window.fetch = function (input) {
      var promise = originalFetch.apply(this, arguments)
      try {
        var url = typeof input === 'string' ? input : input && input.url
        if (isTimedText(url))
          promise.then(
            function (response) {
              if (response && response.ok)
                response
                  .clone()
                  .text()
                  .then(function (text) {
                    publish(response.url || url, text)
                  }, function () {})
            },
            function () {}
          )
      } catch (error) {}
      return promise
    }
})()
