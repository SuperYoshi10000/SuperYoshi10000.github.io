//@ts-check

/** @typedef {typeof FSEntry | typeof FSFile | typeof FSDirectory?} FSEntryType */
/**
 * @template {FSEntryType} T 
 * @typedef {T extends typeof FSEntry ? FSEntry : T extends typeof FSFile ? FSFile : T extends typeof FSDirectory ? FSDirectory : null} FSEntryInstance
 */
/**
 * @exports FSEntryType
 * @exports FSEntryInstance
 */

export class FSEntry {
    /** @readonly */
    name;
    /** @readonly */
    type;
    /** @readonly */
    parent;
    /**
     * @param {string} name
     * @param {FSEntryType} type
     * @param {FSDirectory?} parent
     */
    constructor(name, type, parent = null) {
        this.name = name;
        this.type = type;
        this.parent = parent;
    }
    
    /** @readonly */
    get path() {
        return this.parent ? `${this.parent.path}/${this.name}` : this.name;
    }
    /** @readonly */
    get typename() {
        return this.type === FSFile ? "file" : this.type === FSDirectory ? "dir" : "unknown";
    }
    toString() {
        return `${this.typename}: ${this.path}`;
    }

    /**
     * @param {FSEntryType} type
     */
    is(type) {
        return !type || this instanceof type;
    }
}
export class FSFile extends FSEntry {
    /** @readonly */
    static encoder = new TextEncoder();
    /** @type {ArrayBuffer} */
    content;
    /**
     * @param {string} name
     * @param {string | ArrayBufferLike | DataView} content
     * @param {FSDirectory?} parent
     */
    constructor(name, content, parent = null) {
        super(name, FSFile, parent);
        if (content instanceof ArrayBuffer || content instanceof SharedArrayBuffer) {
            this.content = content;
        } else if (content instanceof DataView) {
            this.content = content.buffer;
        } else {
            this.content = FSFile.encoder.encode(content).buffer;
        }
    }
}
export class FSDirectory extends FSEntry {
    /** @readonly */
    /** @type {Map<string, FSEntry>} */
    entries = new Map();
    /**
     * @param {string} name
     * @param {FSEntry[]?} entries
     * @param {FSDirectory?} parent
     */
    constructor(name, entries = [], parent = null) {
        super(name, FSDirectory, parent);
        if (!entries) entries = [];
        for (const entry of entries) {
            this.addEntry(entry);
        }
    }
    /**
     * @param {FSEntry} entry
     * @param {string} name
     * @returns {boolean}
     */
    addEntry(entry, name = entry.name) {
        if (this.entries.has(name)) return false;
        this.entries.set(name, entry);
        return true;
    }
    /**
     * @param {FSEntry} entry
     * @param {string} name
     * @returns {FSEntry?}
     */
    setEntry(entry, name = entry.name) {
        let oldEntry = this.entries.get(name);
        this.entries.set(name, entry);
        return oldEntry ?? null;
    }
    /**
     * @template {FSEntryType} T
     * @param {string} name
     * @param {T} type
     * @returns {FSEntryInstance<T>?}
     */
    getEntry(name, type) {
        let entry = this.entries.get(name);
        if (!entry) return null;
        if (type && !(entry instanceof type)) return null;
        return /** @type {FSEntryInstance<T>} */(entry);
    }
    /**
     * @param {string} name
     * @param {FSEntryType} type
     * @returns {boolean}
     */
    hasEntry(name, type) {
        return this.entries.has(name) && (!type || this.entries.get(name) instanceof type);
    }
    /**
     * @param {string} name
     * @returns {boolean}
     */
    deleteEntry(name, type) {
        if (!this.entries.has(name)) return false;
        if (type && !(this.entries.get(name) instanceof type)) return false;
        return this.entries.delete(name);
    }

    /**
     * @template {FSEntryType} T
     * @param {T} type
     * @returns {FSEntryInstance<T>[]}
     */
    getEntries(type) {
        let entries = [...this.entries.values()];
        if (type) entries = entries.filter(entry => entry.is(type));
        return /** @type {FSEntryInstance<T>[]} */(entries);
    }
    /**
     * @param {FSEntryType} type
     * @returns {string[]}
     */
    getEntryNames(type) {
        let entries = [...this.entries.keys()];
        if (type) entries = entries.filter(entry => this.entries.get(entry)?.is(type));
        return entries;
    }
    /**
     * @returns {FSFile[]}
     */
    getFiles() {
        let files = this.getEntries(FSFile);
        let directories = this.getEntries(FSDirectory);
        for (const directory of directories) {
            files.push(...directory.getFiles());
        }
        return files;
    }
}


/**
 * @param {EventTarget} target
 * @param {string | string[]} event
 * @param {string | string[]} fail
 * @param {{ timeout?: number; }} options
 */
export async function awaitEvent(target, event, fail, options) {
    if (typeof event === "string") event = [event];
    if (typeof fail === "string") fail = [fail];
    return new Promise((resolve, reject) => {
        event.forEach(e => target.addEventListener(e, resolve, { once: true }));
        fail.forEach(e => target.addEventListener(e, reject, { once: true }));
        if (options?.timeout) setTimeout(() => reject(new Error("Timeout")), options.timeout);
    });
}

const root = new FSDirectory('/');
export const filesystem = root;

const databaseRequest = indexedDB.open("filesystem", 1);
await awaitEvent(databaseRequest, "success", "error", { timeout: 5000 });
const database = databaseRequest.result;

onload = function() {
    const transaction = database.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const request = store.get("fs");
    request.onsuccess = function() {
        const data = request.result;
        if (data) {
            Object.assign(root, data);
        }
    };
    request.onerror = function() {
        console.error("Failed to load filesystem from database");
    };
    transaction.oncomplete = function() {
        console.log("Filesystem loaded from database");
    };
    transaction.onerror = function() {
        console.error("Failed to load filesystem from database");
    };
}
export function updateFileDatabase() {
    const transaction = database.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.put(root, "fs");
    transaction.oncomplete = () => console.log("Database updated");
    transaction.onerror = () => console.error("Database update failed");
}