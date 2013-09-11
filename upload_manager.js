define(function(require, module, exports) {
    "use strict";
    
    main.consumes = ["fs", "nodeapi"];
    main.provides = ["upload_manager"];
    return main;

    /** 
     * Browser notes:
     * 
     * 1. '/' in file names are replaces by ':'
     * 2. Drag and Drop sets e.files (FileList)
     * 3. Chrome also sets e.items in drag and drop, which supports folders
     * 4. Firefox does not support folder upload in any way
     * 5. Safari also doesn't support folder upload
     * 6. Folders will show up in a FileList but are almost impossible to destinguish from files
     */

    function main(options, imports, register) {
        var path        = imports.nodeapi.path;
        var UploadBatch = require("./batch");

        var EventEmitter = imports.nodeapi.events;
        var fs           = imports.fs;
            
        var STATE_NEW       = "new";
        var STATE_UPLOADING = "uploading";
        var STATE_PAUSED    = "paused";
        var STATE_RESUME    = "resume";
        var STATE_DONE      = "done";
        var STATE_ERROR     = "error";

        function UploadManager(options) {
            this.jobs               = [];
            this.filesPrefix        = options.filesPrefix;
            this.concurrentUploads  = options.concurrentUploads || 6;

            var emitter = new EventEmitter();
            this.on     = emitter.on.bind(emitter);
            this.off    = emitter.off.bind(emitter);
            this._emit  = emitter.emit.bind(emitter);
        }
        
        UploadManager.isSupported = function() {
            return (window.FormData);
        };
        
        UploadManager.prototype.upload = function(targetPath, batch, dialog, callback) {
            var that = this;
            
            forEach(batch.getRoots(), function(root, next) {
                fs.exists(path.join(targetPath, root), function(exists) {
                    if (!exists) 
                        return uploadFiles(root, false, next);
                    
                    getAction(batch, root, function(action) {
                        switch(action) {
                            case "replace":
                                uploadFiles(root, true, next);
                                break;
                            
                            case "no-replace":
                                batch.removeRoot(root);
                                return next();
                                
                            case "stop":
                                return callback();
                                
                            default:
                                throw new TypeError("Invalid replace action: " + action);
                        }
                    });
                });
            }, callback);
            
            var toAll  = false;
            var action = "";
            function getAction(batch, root, callback) {
                if (toAll) return callback(action);
                
                dialog(batch, targetPath, root, function(_action, _toAll) {
                    toAll  = _toAll;
                    action = _action;
                    
                    callback(action); 
                });
            }
            
            function uploadFiles(root, doOverwrite, callback) {
                var files = batch.subTree(root);
                
                overwrite();
                
                function overwrite() {
                    if (doOverwrite && (files.length !== 1 || files[0].name !== root))
                        fs.rmdir(path.join(targetPath, root), {recursive: true}, upload);
                    else
                        upload();
                }
                    
                function upload(err) {
                    if (err) return callback(err);
                    
                    var uploaded = 0;
                    files.forEach(function(file) {
                        var job =  that.uploadFile(file, path.join(targetPath, file.fullPath));
                        file.job = job;
                        job.on("changeState", function(state) {
                            if (state == STATE_DONE || state == STATE_ERROR) {
                                uploaded++;
                                
                                if (uploaded == files.length)
                                    that._emit("batchDone", batch);
                            }
                        });
                    });
                    
                    callback();
                }
            }
        };
        
        UploadManager.prototype._createJob = function(file, fullPath) {
            return new UploadJob(file, fullPath, this);
        };
        
        UploadManager.prototype.uploadFile = function(file, fullPath) {
            var job = this._createJob(file, fullPath);
            job.on("changeState", this._check.bind(this));
            
            this.jobs.push(job);
            this._emit("addJob", job);
            
            // give caller a chance to attach event listeners
            setTimeout(this._check.bind(this), 0);
            return job;
        };

        UploadManager.prototype.batchFromInput = function(inputEl, callback) {
            return UploadBatch.fromInput(inputEl, callback);
        };
        
        UploadManager.prototype.batchFromDrop = function(dropEvent, callback) {
            return UploadBatch.fromDrop(dropEvent, callback);
        };
        
        UploadManager.prototype.batchFromFileApi = function(entries, callback) {
            return UploadBatch.fromFileApi(entries, callback);
        };
        
        UploadManager.prototype.jobById = function(id) {
            for (var i = 0; i < this.jobs.length; i++) {
                var job = this.jobs[i];
                if (job.id == id) {
                    return job;
                }
            }
        };
        
        UploadManager.prototype._check = function() {
            var that = this;
            this.jobs = this.jobs.filter(function(job) {
                if (job.state === STATE_DONE || job.state === STATE_ERROR) {
                    setTimeout(function() {
                        that._emit("removeJob", job);
                    }, 0);
                    return false;
                }
                return true;
            });
            
            var wip = [];
            var candidates = [];
            this.jobs.forEach(function(job) {
                switch (job.state) {
                    case STATE_RESUME:
                        candidates.push(job);
                        break;
                        
                    case STATE_NEW:
                        candidates.unshift(job);
                        break;
                        
                    case STATE_UPLOADING:
                        wip.push(job);
                        break;
                        
                    default:
                        break;
                }
            });

            for (var i=wip.length; i<this.concurrentUploads; i++) {
                var job = candidates.pop();
                if (!job)
                    break;
                    
                job._startUpload();
            }
        };
            
        function UploadJob(file, fullPath, manager) {
            this.fullPath = fullPath;
            this.file = file;
            this.manager = manager;
            this.state = STATE_NEW;
            this.progress = 0;
            this.id = UploadJob.ID++;
            
            var emitter = new EventEmitter();
            this.on = emitter.on.bind(emitter);
            this.off = emitter.off.bind(emitter);
            this._emit = emitter.emit.bind(emitter);
        }
        
        UploadJob.ID = 1;
        
        UploadJob.prototype.cancel = function() {
            if (this.xhr)
                this.xhr.abort();
                
            this._setState(STATE_ERROR);
        };
        
        UploadJob.prototype._setState = function(state) {
            this.state = state;
            this._emit("changeState", state);
            this._emit(state);
        };

        UploadJob.prototype._error = function(code, message) {
            this.error = {
                code: code,
                message: message
            };
            this._setState(STATE_ERROR);
        };
        
        UploadJob.prototype._progress = function(progress) {
            this.progress = progress;
            this._emit("progress", progress);
        };
        
        UploadJob.prototype._startUpload = function() {
            var job = this;
            job._setState(STATE_UPLOADING);
                            
            var url = path.join(job.manager.filesPrefix, job.fullPath);
            
            var xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);
            xhr.onload = function(e) { 
                job._progress(1);
                if (xhr.status >= 400)
                    job._error(xhr.status, xhr.statusText);
                else
                    job._setState("done");
                xhr = null;
            };
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    job._progress(e.loaded / e.total);
                }
            };
    
            xhr.send(job.file);
        };
        
        UploadJob.prototype._startUploadWorker = function() {
            var job = this;
            job._setState(STATE_UPLOADING);
                            
            var url = path.join(job.manager.filesPrefix, job.fullPath);
            
            var worker = new Worker(path.join(options.workerPrefix, "upload_worker.js"));
            worker.postMessage({method: "start", args: [job.file, url]});
            
            this.xhr = {
                abort: worker.postMessage.bind(worker, {method: "abort"})
            };
            
            worker.onmessage = function(msg) {
                var method = msg.data.method;
                var args = msg.data.args || [];
                if (method == "_setState") {
                    this.xhr = null;
                    worker.terminate();
                }
                    
                job[method].apply(job, args);
            };        
        };
        
        function forEach(list, onEntry, callback) {
            (function loop(i) {
                if (i >= list.length)
                    return callback();
                    
                onEntry(list[i], function(err) {
                    if (err) return callback(err);
                    
                    loop(i+1);
                });
            })(0);
        }
        
        /**
         * The upload manager handles all file uploads. It keeps a list of all
         * scheduled jobs and tracks their progress. The upload manager does not 
         * depend on any UI.
         * 
         * @event addJob Fires when an upload is started. Passes a Job instance
         * @event removeJob Fires when a job has finished uploading of faild to
         *   upload. Passes the Job object
         * @event batchDone Fires when all files of an upload batch are uploaded
         *   Passes the batch object.
         */
        var manager = new UploadManager(options);
        register(null, {
            "upload_manager": {
                
                /**
                 * Whether the browser supports folder uploads
                 */
                SUPPORT_FOLDER_UPLOAD: UploadBatch.SUPPORT_FOLDER_UPLOAD,
                
                /**
                 * Checks whether file upload API is supported
                 * 
                 * @returns {Boolean} whether the browser supports file uploads
                 */
                isSupported: UploadManager.isSupported,
                
                /**
                 * Array of all active upload jobs
                 */
                get jobs() { return manager.jobs; },
                
                /**
                 * Uploads a batch of files to the server.
                 * 
                 * @param {String} targetPath Path on the server where to store
                 *   the files
                 * @param {Batch} batch the batch of files to upload
                 * @param dialog {function()}
                 * @param {Function} callback The callback is called when all
                 *   file uploads have been scheduled. It will not wait for the
                 *   upload to complete
                 * 
                 */
                upload: manager.upload.bind(manager),
                
                /**
                 * Upload a single file
                 * 
                 * @param {File} file The file object from the file HTML5 API
                 * @param {String} fullPath Target path of the file
                 * @returns {Job} the upload job to track the upload
                 */
                uploadFile: manager.uploadFile.bind(manager),
                
                /**
                 * Extract the batch of files to upload from a file upload
                 * inpuit element.
                 * 
                 * @param {HTMLInputElement} inputEl The file upload input 
                 *   element.
                 * @param {Fucntion} callback Callback returns the Batch object
                 */
                batchFromInput: manager.batchFromInput.bind(manager),
                
                /**
                 * Extract the batch of files to upload from a HTML5 native
                 * drop event.
                 * 
                 * @param {DragEvent} dropEvent native DOM drop event
                 * @param {Fucntion} callback Callback returns the Batch object
                 */
                batchFromDrop: manager.batchFromDrop.bind(manager),
                
                /**
                 * Extract the batch of files to upload from a HTML5 FILE API 
                 * directory entry.
                 * drop event.
                 * 
                 * @param {Object} entries HTML5 file API entries
                 * @param {Fucntion} callback Callback returns the Batch object
                 */
                batchFromFileApi: manager.batchFromFileApi.bind(manager),
                
                /**
                 * Find an upload job by its ID
                 * 
                 * @param {Number} id The job id 
                 * @returns {Job} the associated job
                 */
                jobById: manager.jobById.bind(manager),
                
                on: manager.on.bind(manager),
                off: manager.off.bind(manager)
            }
        });
    }
});