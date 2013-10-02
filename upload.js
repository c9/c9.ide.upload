define(function(require, exports, module) {
    "use strict";
    
    main.consumes = [
        "Plugin", "util", "ui", "layout", "menus", "fs", "tree",
        "fs.cache", "upload.manager", "apf"
    ];
    main.provides = ["upload"];
    return main;
    
    function main(options, imports, register) {
        var util          = imports.util;
        var Plugin        = imports.Plugin;
        var ui            = imports.ui;
        var menus         = imports.menus;
        var fsCache       = imports["fs.cache"];
        var tree          = imports.tree;
        var uploadManager = imports["upload.manager"];
        var apf           = imports.apf;
        
        var path          = require("path");
        var css           = require("text!./upload.css");
        
        var winUploadFileExistsMarkup = require("text!./markup/win_upload_file_exists.xml");
        var winUploadFilesMarkup      = require("text!./markup/win_upload_files.xml");
        
        /***** Initialization *****/
        
        var MAX_FILE_COUNT  = options.maxFileCount || 20000;
        var MAX_UPLOAD_SIZE = options.maxUploadSize || 50 * 1000 * 1000;

        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var winUploadFiles, trFiles;
        var winUploadFileExists;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Menus
            menus.addItemByPath("File/~", new ui.divider(), 350, plugin);
            menus.addItemByPath("File/Upload Local Files...", new ui.item({
                onclick : showUploadWindow
            }), 370, plugin);

            menus.addItemByPath("File/Download Project", new ui.item({
                onclick : function(){
                    window.open("/download");
                }
            }), 390, plugin);

            // Context Menu
            tree.getElement("mnuCtxTree", function(mnuCtxTree){
                menus.addItemToMenu(mnuCtxTree, new ui.item({
                    id      : "mnuCtxTreeUpload",
                    match   : "[folder]",
                    caption : "Upload",
                    onclick : showUploadWindow
                }), 420, plugin);
            });
            
            uploadManager.on("addJob", onAddUploadJob);
        }
        
        /***** Methods *****/
        
        function onAddUploadJob(e) {
            var job = e.job;
            var dir = path.dirname(job.fullPath);
            
            var cleanup = function() {};
            function onExpand(e) {
                console.log("expand", e.path, dir);
                if (e.path == dir) {
                    cleanup();
                    updateNode(fsCache.findNode(dir));
                    console.log("match!!");
                }
            }
            
            function updateNode(parent) {
                var node = fsCache.findNode(job.fullPath);
                if (!node) {
                    node = fsCache.createNode(job.fullPath, {
                        mime : job.file.type,
                        size : job.file.size || 0
                    });
                    node.setAttribute("type", "fileupload");
                    ui.xmldb.appendChild(parent, node);
                }
                else {
                    ui.xmldb.setAttribute(node, "type", "fileupload");
                }
                
                console.log("new node", node);
            }
            
            job.on("changeState", function(state) {
                console.log("state", state)
                switch(state) {
                    case "uploading":
                        // add to tree
                        fsCache.on("readdir", onExpand);
                        cleanup = function() {
                            fsCache.off("readdir", onExpand);
                        };
                        
                        var parent = fsCache.findNode(dir);
                        if (parent) {
                            updateNode(parent);
                        }
                        
                        console.log("up", job)
                        break;
                        
                    case "done":
                        // remove uploading state
                        var node = fsCache.findNode(job.fullPath);
                        if (node)
                            ui.xmldb.setAttribute(node, "type", "file");
                        
                        cleanup();
                        break;
                        
                    case "error":
                        // remove node from tree
                        var node = fsCache.findNode(job.fullPath);
                        if (node)
                            ui.xmldb.removeNode(node);
                            
                        cleanup();
                        break;
                }
            });
        }
        
        function uploadFromInput(inputEl) {
            uploadManager.batchFromInput(inputEl, function(err, batch) {
                if (err) return onUploadError(err);
                uploadBatch(batch);
            });
        }
        
        function uploadFromDrop(dropEvent, targetPath) {
            uploadManager.batchFromDrop(dropEvent, function(err, batch, skipped) {
                if (err) return onUploadError(err);
                if (Object.keys(skipped).length) {
                    util.alert(
                        "File upload",
                        "Not all files can be uploaded:",
                        ""
                    );
                    winAlertMsg.$ext.innerHTML = Object.keys(skipped).map(util.escapeXml).join("</br>");
                }
                uploadBatch(batch, targetPath);
            });
        }
        
        function onUploadError(err) {
            // TODO
            console.error(err);
        }
        
        function uploadBatch(batch, targetPath) {
            // 1. has directories
            if (batch.hasDirectories()) {
                util.alert(
                    "Folder Upload",
                    "Folder uploads are currently only supported by Google Chrome.",
                    "If you want to upload folders you need to run a current version of Google Chrome."
                );
                return;
            }

            // 2. filter DS_Store
            batch.ignoreFiles({
                ".DS_Store": 1
            });
            
            var sizes = batch.getSizes();
            
            // 3. check file count
            if (sizes.count > MAX_FILE_COUNT) {
                util.alert(
                    "Too many files",
                    "File uploads are limited to " + MAX_FILE_COUNT + " files per upload.",
                    "Please upload files in smaller batches"
                );
                return;
            }
            
            // 4. check total size quota
            if (sizes.sum > MAX_UPLOAD_SIZE) {
                util.alert(
                    "Maximum upload-size exceeded",
                    "File uploads are limited to " + Math.floor(MAX_UPLOAD_SIZE / 1000 / 1000) + "MB in total.",
                    ""
                );
                return;
            }

            // 6. start upload if still files in batch
            if (!batch.files.length)
                return;

            
            var targetFolder;
            if (targetPath) {
                targetFolder = fsCache.findNode(targetPath);
            }
            else {
                targetFolder = getTargetFolder();
                targetPath = targetFolder.getAttribute("path");
            }
            
            tree.expand(targetFolder, function() {
                uploadManager.upload(targetPath, batch, fileExistsDialog, function(err) {
                    // TODO handle error
                });
            });

            var initialSelection = JSON.stringify(tree.selection);
            uploadManager.on("batchDone", function onBatchDone(e) {
                var b = e.batch;
                if (b != batch) return;
                
                uploadManager.off("batchDone", onBatchDone);
                if (initialSelection == JSON.stringify(tree.selection)) {
                    tree.selectList(batch.getRoots().map(function(p) { return path.join(targetPath, p); }));
                }
            });
        }
        
        function showUploadWindow() {
            
            function handleFileSelect(e) {
                uploadFromInput(e.target);
                e.target.value = "";
            }
            
            if (!winUploadFiles) {
                ui.insertCss(css, options.staticPrefix, plugin);
                ui.insertMarkup(null, winUploadFilesMarkup, plugin);
                
                winUploadFiles = plugin.getElement("winUploadFiles");

                winUploadFiles.on("show", function(e) {
                    onShow();
                });
                winUploadFiles.on("close", function(e) {
                    onClose();
                });
                winUploadFiles.selectNodes(".//a:button").pop().on("click", function() {
                    winUploadFiles.hide();
                });
                
                var fileUploadSelect = plugin.getElement("fileUploadSelect");
                var folderUploadSelect = plugin.getElement("folderUploadSelect");
                var hboxUploadNoFolders = plugin.getElement("hboxUploadNoFolders");
                var hboxUploadWithFolders = plugin.getElement("hboxUploadWithFolders");
                
                var filebrowser = fileUploadSelect.$ext;
                filebrowser.addEventListener("change", handleFileSelect, false);
    
                // enable folder upload
                if (uploadManager.SUPPORT_FOLDER_UPLOAD) {
                    hboxUploadNoFolders.hide();
                    hboxUploadWithFolders.show();
    
                    apf.setStyleClass(filebrowser, "uploadWithFolders");
    
                    var folderbrowser = folderUploadSelect.$ext;
                    folderbrowser.style.display = "block";
                    folderbrowser.addEventListener("change", handleFileSelect, false);
                }
                emit("drawUploadWindow", plugin.getElement("uploadDropArea"));
            }
            
            winUploadFiles.show();
        }
        
        function hideUploadWindow() {
            winUploadFiles && winUploadFiles.hide();
        }
    
        function fileExistsDialog(batch, path, root, callback) {
            if (!winUploadFileExists) {
                ui.insertMarkup(null, winUploadFileExistsMarkup, plugin);
                winUploadFileExists = plugin.getElement("winUploadFileExists");
            }

            var overwriteAll = plugin.getElement("btnUploadOverwriteAll");
            var skipAll      = plugin.getElement("btnUploadSkipAll");
            var overwrite    = plugin.getElement("btnUploadOverwrite");
            var skip         = plugin.getElement("btnUploadSkip");
            
            if (batch.files.length > 1) {
                overwriteAll.show();
                skipAll.show();
            }
            else {
                overwriteAll.hide();
                skipAll.hide();
            }
            
            plugin.getElement("uploadFileExistsMsg").$ext.textContent = 
                "\"" + root + "\" already exists, do you want to replace it? Replacing it will overwrite its current contents.";

            winUploadFileExists.show();
            
            function oa(e) {
                done("replace", true);
            }
            function sa(e) {
                done("stop", true);
            }
            function o(e) {
                done("replace", false);
            }
            function s(e) {
                done("no-replace", false);
            }
            overwriteAll.on("click", oa);
            skipAll.on("click", sa);
            overwrite.on("click", o);
            skip.on("click", s);
            
            function done(action, toAll) {
                winUploadFileExists.hide();
                
                overwriteAll.off("click", oa);
                skipAll.off("click", sa);
                overwrite.off("click", o);
                skip.off("click", s);
                
                callback(action, toAll);
            }
        }
    
        function onShow (){
            if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
                util.alert("The File APIs are not fully supported in this browser.");
                return hideUploadWindow();
            }
    
            updateTargetFolder();
            tree.on("select", updateTargetFolder);
        }
    
        function onClose () {
            tree.off("select", updateTargetFolder);
        }
    
        function getTargetFolder() {
            var node = fsCache.findNode(tree.selected);
            
            var target;
            if (node)
                target = node.localName == "file" ? node.parentNode : node;
            else 
                target = fsCache.findNode("/");
    
            return target;
        }
        
        function updateTargetFolder() {
            plugin.getElement("uplTargetFolder").$ext.textContent 
                = getTargetFolder().getAttribute("path");
        }
        
        // add file to file tree
        function addToFileTree(file) {
            var filename = apf.escapeXML(file.name);
            var path = apf.escapeXML(file.path) + "/" + filename;
    
            var treeNode = trFiles.queryNode(
                "//file[@path=" + util.escapeXpathString(path) + "]"
            );
            if (treeNode)
                apf.xmldb.removeNode(treeNode);
    
            var xmlNode = apf.n("<file />")
                .attr("type", "fileupload")
                .attr("name", filename)
                .attr("path", path)
                .node();
    
            file.treeNode = apf.xmldb.appendChild(file.targetFolder, xmlNode);
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
        
        /**
         * Implements the file upload UI for Cloud9 IDE
         * @singleton
         **/
        plugin.freezePublicAPI({
            /**
             * Display the file upload window
             */
            showUploadWindow    : showUploadWindow,
            
            /**
             * Display the file exists dialog.
             * Only used for unit testing
             */
            fileExistsDialog    : fileExistsDialog,
            
            /**
             * Upload files from a native drag and drop operation
             * 
             * @param {DragEvent} dropEvent native DOM drop event
             * @param {String} targetPath path where to upload the files
             */
            uploadFromDrop      : uploadFromDrop,
            
            /**
             * Upload files from an file upload input element
             * 
             * @param {HTMLInputElement} inputElement the upload input DOM 
             *   element
             */
            uploadFromInput     : uploadFromInput
        });
        
        register(null, {
            upload: plugin
        });
    }
});