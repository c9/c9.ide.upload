define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "upload", "tree", "ui", "layout", "c9"
    ];

    main.provides = ["dragdrop"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var upload   = imports.upload;
        var tree     = imports.tree;
        var ui       = imports.ui;
        var layout   = imports.layout;
        var c9       = imports.c9;
        
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
            
            document.addEventListener("dragenter", dragEnter, true);
            document.addEventListener("dragleave", dragLeave, true);
            document.addEventListener("dragover", dragOver, true);
            document.addEventListener("drop", dragDrop, true);
        }
        
        function unload() {
            loaded = false;
            document.removeEventListener("dragenter", dragEnter, true);
            document.removeEventListener("dragleave", dragLeave, true);
            document.removeEventListener("dragover", dragOver, true);
            document.removeEventListener("drop", dragDrop, true);
        }
        
        /***** Methods *****/
        
        var dragContext = {};
        
        function dragEnter(e) {
            apf.preventDefault(e)
            if (this.disableDropbox || !isFile(e))
                return;
            var host = findHost(e.target);
            if (!host)
                return;
            
            if (!dragContext.mouseListener)
                window.addEventListener("mousemove", clearDrag, true);
            // TODO open tree panel when hoverng over the button
            updateTreeDrag(e, host);
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
            
            console.log(dragContext.path);
        }
        
        function dragDrop(e) {
            apf.preventDefault(e);
            var path = dragContext.path || dragContext.pane;
            clearDrag(e);
            if (this.disableDropbox)
                return;
console.log(dragContext.path, path);
            if (path)
                upload.uploadFromDrop(e, path);
            apf.stopEvent(e);
        }
        
        function clearDrag(e) {
            dragContext.mouseListener = null;
            window.removeEventListener("mousemove", clearDrag, true)
            updateTreeDrag(e);
            updateTabDrag();
            updateUploadAreaDrag();
        }
        
        // helper
        function findHost(el) {
            var treeEl = tree.getElement("container");
            while (el) {
                var host = el.host;
                if (host && (host.cloud9pane || host === treeEl))
                    return host;
                el = el.parentNode
            }
        }
        
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
            var pane = host && host.parentNode &&
                (host.cloud9pane || host.parentNode.cloud9pane);
                
            if (pane) {
                dragContext.path = null;
                if (dragContext.pane === pane)
                    return;
                
                var parent = pane.container;
                dropbox = getDropbox();
                parent && parent.appendChild(dropbox);
                apf.setStyleClass(dropbox, "over");
                
                dragContext.pane = pane;
            } else if (dragContext.pane) {
                dragContext.pane = null;
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
        function updateTreeDrag(e, host) {
            if (!treeMouseHandler)
                treeMouseHandler = tree.tree.$mouseHandler;
            
            var online = c9.status & c9.STORAGE;
            if (online && host === tree.getElement("container")) {
                if (!treeMouseHandler.releaseMouse) {
                    treeMouseHandler.captureMouse(e);
                    treeMouseHandler.setState("drag");
                    treeMouseHandler.dragStart();
                    tree.tree.on("folderDragEnter", folderDragEnter);
                    tree.tree.on("folderDragLeave", folderDragLeave);
                }
            } else if (treeMouseHandler && treeMouseHandler.releaseMouse) {
                treeMouseHandler.releaseMouse(e || {});
                tree.tree.off("folderDragEnter", folderDragEnter);
                tree.tree.off("folderDragLeave", folderDragLeave);
            }
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