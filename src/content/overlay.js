window.addEventListener("load", function() { fb2Handler.init(); }, false)

const FB2_NS   = 'http://www.gribuser.ru/xml/fictionbook/2.0'
const XLink_NS = 'http://www.w3.org/1999/xlink'
const xHTML_NS = 'http://www.w3.org/1999/xhtml'

// utility DOM management functions
var util = {
    // see https://developer.mozilla.org/en/Xml/id
    // and http://bit.ly/24gZUo for a reason why it is needed
    getElements : function (doc, query, resultType, prefix) {
        if (resultType == null)
            resultType = XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE
        
        // could use: namespace-uri()='"+FB2_NS+"' and ..
        return doc.evaluate("//fb2:"+query, doc.documentElement, 
                    function(){return FB2_NS},
                    resultType, null
                    );
    },

    getSingleElement : function (doc, query) {
        return util.getElements(doc, query, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue
    },

    getHrefVal : function(elem){ // returns id of element XLink ponts to, like l:href="#note1"
        return elem.getAttributeNS(XLink_NS, 'href').slice(1)
    },
}

// actual handler
var fb2Handler = {
    init: function() {
        var appcontent = document.getElementById("appcontent") // browser
        if(appcontent)
            appcontent.addEventListener("DOMContentLoaded", fb2Handler.onPageLoad, true)
    },

    internal_link: function(event) {
        fb2Handler.scrollToHref(event.target.ownerDocument, event.target.href)
    },

    url_change: function(event) {
        // even.target is window here
        fb2Handler.scrollToHref(event.target.document, event.target.location.toString())
    },

    scrollToHref: function(doc, href) {
        var elem = util.getSingleElement(doc, "*[@id='"+href.slice(href.indexOf("#")+1)+"']")
        var pos = elem.getBoundingClientRect()
        var win = doc.defaultView
        win.scroll(win.scrollX+pos.left, win.scrollY+pos.top)
    },

    tooltip: function(event) {
        var a = event.target
        var doc = event.target.ownerDocument
        if (a.nodeName=='a'){

            try { // move it here if not yet
                var note = util.getSingleElement(doc, "section[@id='"+util.getHrefVal(a)+"']")
                a.appendChild(note)
            } catch(e) { // just get it
                var note = a.firstChild
                while (note.nodeName != 'section')
                    note = note.nextSibling
            } 

            // alters the note box's position_h to keep it on screen
            if ( note.getBoundingClientRect().right > window.innerWidth )
                note.setAttribute('position_h', 'left')
            if ( note.getBoundingClientRect().left < 0 )
                note.setAttribute('position_h', '')
        }
    },

    onPageLoad: function(event) {
        // that is the document that triggered event
        var doc = event.originalTarget
        // execute for FictionBook only
        
        var prefs = Cc["@mozilla.org/preferences-service;1"]
                        .getService(Ci.nsIPrefBranch);

        if(doc.location.href.search(".fb2") > -1 && 
                    prefs.getBoolPref("extensions.fb2reader.enabled") ) {
            try { // SeaMonkey and Fennec do not have it
                var browser = gBrowser.getBrowserForDocument(doc)
                var tabIndex = gBrowser.browsers.indexOf(browser)
                tab = gBrowser.tabContainer.childNodes[tabIndex]

                // change favicon on the tab
                var img = document.getAnonymousElementByAttribute(tab, "class", "tab-icon-image")
                img.src="chrome://fb2reader/skin/icon-16.png"
                // assign title to the tab
                var lbl = document.getAnonymousElementByAttribute(tab, "class", "tab-text")
                lbl.value = doc.getElementsByTagName("book-title")[0].textContent
            } catch(e) {}

            // for each fb2 image we will create xHTML one        
            var images = util.getElements(doc, "image")
            for ( var i=0 ; i < images.snapshotLength; i++ ) {
                try { // ignore malformed images
                    var img = images.snapshotItem(i)
                    // we get corresponding binary node
                    var bin = util.getSingleElement(doc, "binary[@id='"+util.getHrefVal(img)+"']")
                    // create xhtml image and set src to its base64 data
                    var ximg = doc.createElementNS(xHTML_NS, 'img')
                    ximg.src='data:'+bin.getAttribute('content-type')+';base64,'+bin.textContent
                    img.parentNode.insertBefore(ximg, img)
                } catch(e) {}
            }

            // add listener to all footnote links
            var notelinks = util.getElements(doc, "a[@type='note']")
            for ( var i=0 ; i < notelinks.snapshotLength; i++ ) {
                var note = notelinks.snapshotItem(i)
                note.addEventListener("mouseover", fb2Handler.tooltip, true)
            }

            // replace external links with xHTML ones, add handler to internal ones
            var extlinks = util.getElements(doc, "a[@type!='note' or not(@type)]")
            for ( var i=0 ; i < extlinks.snapshotLength; i++ ) {
                var link = extlinks.snapshotItem(i)
                var href = link.getAttributeNS(XLink_NS, 'href')
                xlink= doc.createElementNS(xHTML_NS, 'a')
                xlink.href = href
                link.parentNode.insertBefore(xlink, link)
                // move contents
                while(link.firstChild)
                    xlink.appendChild(link.firstChild)
                if (href.slice(0,1) == '#') { 
                        xlink.addEventListener("click", fb2Handler.internal_link, true)
                } else {
                    xlink.target = "_blank"
                }
            }
            
            // will scroll when back-forward clicked, Gecko 1.9.2 only
            if ("onhashchange" in doc.defaultView)
                doc.defaultView.addEventListener("hashchange", fb2Handler.url_change, true)
        }
    }
}

