define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "util", "ui", "layout", "tree", "upload.manager", "anims"
    ];
    main.provides = ["upload.progress"];
    return main;
    
    function main(options, imports, register) {
        var Plugin        = imports.Plugin;
        var ui            = imports.ui;
        var layout        = imports.layout;
        var tree          = imports.tree;
        var anims         = imports.anims;
        var uploadManager = imports["upload.manager"];
        
        var css           = require("text!./upload_progress.css");
        
        var boxUploadActivityMarkup = require("text!./markup/box_upload_activity.xml");
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var list, boxUploadActivity, mdlUploadActivity;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
        
            uploadManager.on("addJob", onAddUploadJob);
            uploadManager.on("removeJob", onRemoveUploadJob);
        }
        
        var drawn = false;
        function draw() {
            if (drawn) return;
            drawn = true;
            
            // load CSS
            ui.insertCss(css, options.staticPrefix, plugin);
            
            // Import Skin
            ui.insertSkin({
                name         : "uploadfiles",
                data         : require("text!./markup/skin.xml"),
                "media-path" : options.staticPrefix + "/images/",
                "icon-path"  : options.staticPrefix + "/icons/"
            }, plugin);
            
            // Create UI elements
            ui.insertMarkup(layout.findParent(plugin), boxUploadActivityMarkup, plugin);
        
            boxUploadActivity = plugin.getElement("boxUploadActivity");
        
            tree.getElement("container", function(treeContainer){
                var p = treeContainer.parentNode;
                var box = new ui.vsplitbox({
                    id       : "vboxTreeContainer",
                    anchors  : "0 0 0 0",
                    splitter : false
                });
                p.insertBefore(box, treeContainer);
                box.appendChild(treeContainer);
                box.appendChild(boxUploadActivity);
            });
            
            list = plugin.getElement("lstUploadActivity");
            mdlUploadActivity = plugin.getElement("mdlUploadActivity");
            
            list.setModel(mdlUploadActivity);
            
            list.on("beforeremove", function(e) {
                var file = e.args[0].args[0];
                var job = uploadManager.jobById(file.getAttribute("job_id"));
                if (job)
                    job.cancel();
                    
                return false;
            });
            
            plugin.getElement("btnCancelUploads").on("click", function(e) {
                cancelAll();
            });
            
            plugin.getElement("btnToggleUploadQueue").addEventListener("click", function(e) {
                var checked = !this.value;
                
                if (checked) {
                    hidePanel(boxUploadActivity);
                } else {
                    showPanel(boxUploadActivity);
                }
            });
                    
            showPanel(boxUploadActivity);
            emit("draw");
        }
        
        /***** Methods *****/
        
        var panelVisible = false;
        
        function hidePanel(list) {
            if (!panelVisible) return;
            panelVisible = false;
            anims.animateSplitBoxNode(list, {
                height         : "22px",
                duration       : 0.2,
                timingFunction : "ease-in-out"
            }); 
        }
        
        function removePanel(list) {
            if (!panelVisible) return;
            panelVisible = false;
            anims.animateSplitBoxNode(list, {
                height         : "0px",
                duration       : 0.2,
                timingFunction : "ease-in-out"
            }); 
        }
        
        function showPanel(list) {
            if (panelVisible) return;
            
            panelVisible = true;
            list.show();
            list.$ext.style.height = "22px";
            anims.animateSplitBoxNode(list, {
                height         : "175px",
                duration       : 0.2,
                timingFunction : "ease-in-out"
            });
        }
        
        function onAddUploadJob(e) {
            var job = e.job
            show();
            
            var n = apf
                .n("<file />")
                .attr("name", job.file.name)
                .attr("job_id", job.id);
            
            if (job.progress)
                n.attr("progress", Math.round(job.progress * 100));
                
            var node = mdlUploadActivity.appendXml(n.node());
            
            job.on("progress", function() {
                apf.xmldb.setAttribute(node, "progress", Math.round(job.progress * 100));
            });
            
            updateUploadCount();
        }
        
        function onRemoveUploadJob(e) {
            var job = e.job;
            show();
            
            var item = mdlUploadActivity.queryNode("file[@job_id='" + job.id + "']");
            if (item)
                apf.xmldb.removeNode(item);
            
            updateUploadCount();
            
            if (uploadManager.jobs.length === 0) {
                setTimeout(function() {
                    removePanel(boxUploadActivity);
                }, 1000);
            }
        }
        
        function updateUploadCount() {
            var count = uploadManager.jobs.length;
            plugin.getElement("boxUploadActivity").setAttribute("caption", "Upload Activity" + (count ? "(" + count + ")" : ""));
        }
        
        function cancelAll() {
            uploadManager.jobs.forEach(function(job) {
                job.cancel(); 
            });
        }
        
        function show() {
            draw();
            list.show();
            showPanel(boxUploadActivity);
        }
        
        function hide() {
            hidePanel(boxUploadActivity);
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function() {
            load();
        });
        plugin.on("enable", function() {
        });
        plugin.on("disable", function() {
        });
        plugin.on("unload", function() {
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Displays the upload progress in a panel below the tree.
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * Show the upload progress panel
             */
            show: show,
            
            /**
             * Hide the upload progress panel
             */
            hide: hide,
            
            /**
             * Cancel all running jobs
             */
            cancelAll: cancelAll
        });
        
        register(null, {
            "upload.progress": plugin
        });
    }
});