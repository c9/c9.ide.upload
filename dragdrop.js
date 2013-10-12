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
        
        // TODO move all this into the tree
        var treeMouseHandler; 
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            ui.insertCss(css, plugin);
            
            upload.on("drawUploadWindow", function(uploadDropArea) {
                uploadDropArea.addEventListener("dragenter", dragEnter, false);
                uploadDropArea.addEventListener("dragleave", dragLeave, false);
                uploadDropArea.addEventListener("drop", dragDrop, false);
                uploadDropArea.addEventListener("dragover", noopHandler, false);
            });
            
            tree.getElement("container", function(container) {
                var el = container.$ext;
                document.body.addEventListener("dragenter", treeDragEnter, false);
                document.body.addEventListener("dragleave", treeDragLeave, false);
                document.body.addEventListener("dragover", treeDragOver, true);
                el.addEventListener("drop", treeDragDrop, false);
                el.addEventListener("dragover", noopHandler, false);
                treeMouseHandler = tree.tree.$mouseHandler;
            });
            
            var holder = layout.findParent(plugin).$ext;
            var dropbox = holder.dropbox = document.createElement("div");
            dropbox.className = "draganddrop";

            var label = document.createElement("span");
            label.textContent = "Drop files here to upload";
            
            dropbox.appendChild(label);
            holder.appendChild(dropbox);

            holder.addEventListener("dragenter", dragEnter, false);
            dropbox.addEventListener("dragleave", dragLeave, false);
            dropbox.addEventListener("drop", dragDrop, false);
            dropbox.addEventListener("dragover", noopHandler, false);
        }
        
        function isFile(e) {
            var types = e.dataTransfer.types;
            if (types && Array.prototype.indexOf.call(types, 'Files') !== -1)
                return true;
        }
        
        /***** Methods *****/
        
        function dragLeave(e) {
            if (this.disableDropbox || !isFile(e))
                return;

            apf.stopEvent(e);
            apf.setStyleClass(this.dropbox || this, null, ["over"]);
        }

        function dragEnter(e) {
            if (this.disableDropbox || !isFile(e))
                return;

            apf.stopEvent(e);
            apf.setStyleClass(this.dropbox || this, "over");
        }

        function dragDrop(e) {
            dragLeave.call(this, e);
            if (this.disableDropbox || !isFile(e))
                return;

            return upload.uploadFromDrop(e);
        }

        var dragContext = {};
        
        function startTreeDrag(e) {
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
            if (!treeMouseHandler.releaseMouse) return;
            
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
        
        function treeDragEnter(e) {
            if (this.disableDropbox || !isFile(e))
                return;
            
            var treeEl = tree.getElement("container").$ext;
            if (isChildOf(treeEl, e.target))
                startTreeDrag(e);
            else
                stopTreeDrag(e);
                
            clearTimeout(dragContext.timer);
            apf.stopEvent(e);
        }
        
        function treeDragLeave(e) {
            if (this.disableDropbox)
                return;
                
            clearTimeout(dragContext.timer);
            dragContext.timer = setTimeout(stopTreeDrag, 100);
            apf.stopEvent(e);
        }
        
        function treeDragOver(e) {
            if (treeMouseHandler.$onCaptureMouseMove)
                treeMouseHandler.$onCaptureMouseMove(e);
            if (dragContext.timer)
                dragContext.timer = clearTimeout(dragContext.timer);
        }
        
        function treeDragDrop(e) {
            var path = dragContext.path;
            apf.stopEvent(e);
            stopTreeDrag(e);
            if (this.disableDropbox)
                return;

            return upload.uploadFromDrop(e, path);
        }
        
        function noopHandler(e) {
            if (this.disableDropbox)
                return;

            apf.stopEvent(e);
        }
        
        function isChildOf(parent, child) {
            var el = child;
            while (el) {
                if (parent == el) return true;
                el = el.parentNode;
            }
            return false;
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
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        plugin.freezePublicAPI({});
        
        register(null, {
            dragdrop: plugin
        });
    }
});