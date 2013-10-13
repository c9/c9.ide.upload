define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "upload", "tree", "ui", "layout"
    ];

    main.provides = ["dragdrop"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var upload   = imports.upload;
        var tree     = imports.tree;
        var ui       = imports.ui;
        var layout   = imports.layout;
        
        var css      = require("text!./dragdrop.css");
        
        var dropbox
        // TODO move all this into the tree
        var treeMouseHandler; 
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            ui.insertCss(css, plugin);
            
            window.addEventListener("dragenter", dragEnter, false);
            window.addEventListener("dragleave", dragLeave, false);
            window.addEventListener("dragover", dragOver, true);
            window.addEventListener("drop", dragDrop, false);
        }
        
        function unload() {
            loaded = false;
            window.removeEventListener("dragenter", dragEnter, false);
            window.removeEventListener("dragleave", dragLeave, false);
            window.removeEventListener("dragover", dragOver, true);
            window.removeEventListener("drop", dragDrop, false);
        }
        
        /***** Methods *****/
        
        var dragContext = {};
        
        function dragEnter(e) {
            apf.preventDefault(e)
            if (this.disableDropbox || !isFile(e))
                return;
            var host = apf.findHost(e.target);
            if (!host)
                return;
            // TODO open tree panel when hoverng over the button

            if (host === tree.getElement("container"))
                startTreeDrag(e);
            else
                stopTreeDrag(e);
                
            updateUploadAreaDrag(host);
            updateTabDrag(host);
                
            clearTimeout(dragContext.timer);
        }
        
        function dragLeave(e) {
            apf.preventDefault(e);
            if (this.disableDropbox)
                return;
                
            clearTimeout(dragContext.timer);
            dragContext.timer = setTimeout(clearDrag, 100);
        }
        
        function dragOver(e) {
            apf.preventDefault(e);
            
            if (treeMouseHandler && treeMouseHandler.$onCaptureMouseMove)
                treeMouseHandler.$onCaptureMouseMove(e);
            if (dragContext.timer)
                dragContext.timer = clearTimeout(dragContext.timer);
        }
        
        function dragDrop(e) {
            apf.preventDefault(e);
            var path = dragContext.path || dragContext.pane;
            clearDrag(e);
            if (this.disableDropbox)
                return;

            return upload.uploadFromDrop(e, path);
        }
        
        function clearDrag(e) {
            stopTreeDrag(e);
            updateTabDrag();
            updateUploadAreaDrag();
        }
        
        // helper
        function isFile(e) {
            var types = e.dataTransfer.types;
            if (types && Array.prototype.indexOf.call(types, 'Files') !== -1)
                return true;
        }
        
        function getDropbox() {
            if (!dropbox) {
                dropbox = document.createElement("div");
                dropbox.className = "draganddrop";

                var label = document.createElement("span");
                label.textContent = "Drop a file here to open";
                dropbox.appendChild(label);
            }
            return dropbox;
        }
        
        function updateTabDrag(host) {
            if (host && host.parentNode) {
                if (host.$baseCSSname === "editor_tab")
                    var target = host;
                else if (host.parentNode.$baseCSSname === "editor_tab")
                    var target = host.parentNode;
            }
            
            if (target) {
                dragContext.path = null;
                if (dragContext.tab == target)
                    return;
                dragContext.tab = target;
                var parent = target.$ext.querySelector(".session_page.curpage");
                dropbox = getDropbox();
                parent && parent.appendChild(dropbox);
                apf.setStyleClass(dropbox, "over");
                
                // TODO how to find pane from host?
                dragContext.pane = {}
            } else if (dragContext.tab) {
                dragContext.pane = null;
                dragContext.tab = null;
                if (dropbox && dropbox.parentNode) {
                    dropbox.parentNode.removeChild(dropbox);
                    apf.setStyleClass(dropbox, null, ["over"]);
                }
            }
        }
        
        function updateUploadAreaDrag(host) {
            if (host && host.$ext && host.$ext.id === "uploadDropArea") {
                dragContext.uploadDropArea = host.$ext;
                dragContext.path = "";
                apf.setStyleClass(dragContext.uploadDropArea, "over");
            } else if (dragContext.uploadDropArea) {
                apf.setStyleClass(dragContext.uploadDropArea, null, ["over"]);
                dragContext.uploadDropArea = null;
            }
        }

        // tree
        function startTreeDrag(e) {
            if (!treeMouseHandler)
                treeMouseHandler = tree.tree.$mouseHandler;
            if (treeMouseHandler.releaseMouse) return;
            
            treeMouseHandler.captureMouse(e);
            treeMouseHandler.setState("drag");
            treeMouseHandler.dragStart();
            dragContext = {};
            tree.tree.on("folderDragEnter", folderDragEnter);
            tree.tree.on("folderDragLeave", folderDragLeave);
            window.addEventListener("mousemove", stopTreeDrag, true);
        }
        
        function stopTreeDrag(e) {
            if (!treeMouseHandler || !treeMouseHandler.releaseMouse) return;
            
            treeMouseHandler.releaseMouse(e || {});
            tree.tree.off("folderDragEnter", folderDragEnter);
            tree.tree.off("folderDragLeave", folderDragLeave);
            window.removeEventListener("mousemove", stopTreeDrag, true)
        }

        function folderDragLeave(node) {
            tree.tree.provider.setClass(node, "dragAppendUpload", false);
            dragContext.path = null;
        }
        
        function folderDragEnter(node) {
            tree.tree.provider.setClass(node, "dragAppendUpload", true);
            dragContext.path = node.path;
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            unload();
        });
        
        /***** Register and define API *****/
        
        plugin.freezePublicAPI({});
        
        register(null, {
            dragdrop: plugin
        });
    }
});