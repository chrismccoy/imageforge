/**
 * SQLite session store
 */

"use strict";

const { SESSION_MAX_AGE_MS, SESSION_SWEEP_MS } = require("../config/limits");

function reporting(work, cb) {
  try {
    work();
    return cb ? cb(null) : undefined;
  } catch (err) {
    return cb ? cb(err) : undefined;
  }
}

module.exports = (session) => {
  const Store = session.Store;

  class SqliteSessionStore extends Store {
    constructor(db, { sweepMs = SESSION_SWEEP_MS } = {}) {
      super();
      this.db = db;
      this.stmts = {
        get: db.prepare("SELECT sess, expire FROM sessions WHERE sid = ?"),
        upsert: db.prepare(
          `INSERT INTO sessions (sid, sess, expire) VALUES (@sid, @sess, @expire)
             ON CONFLICT(sid) DO UPDATE SET sess = @sess, expire = @expire`
        ),
        touch: db.prepare("UPDATE sessions SET expire = ? WHERE sid = ?"),
        destroy: db.prepare("DELETE FROM sessions WHERE sid = ?"),
        prune: db.prepare("DELETE FROM sessions WHERE expire <= ?"),
        clear: db.prepare("DELETE FROM sessions"),
        length: db.prepare("SELECT COUNT(*) AS n FROM sessions"),
      };

      this.timer = setInterval(() => this.prune(), sweepMs);
      if (this.timer.unref) this.timer.unref();
    }

    /**
     * The expiry time for a session.
     */
    expiryOf(sess) {
      const maxAge = sess.cookie && sess.cookie.maxAge;
      const ms = typeof maxAge === "number" ? maxAge : SESSION_MAX_AGE_MS;
      return Date.now() + ms;
    }

    get(sid, cb) {
      try {
        const row = this.stmts.get.get(sid);
        if (!row) return cb(null, null);
        if (row.expire <= Date.now()) {
          this.stmts.destroy.run(sid);
          return cb(null, null);
        }
        return cb(null, JSON.parse(row.sess));
      } catch (err) {
        return cb(err);
      }
    }

    set(sid, sess, cb) {
      return reporting(
        () =>
          this.stmts.upsert.run({
            sid,
            sess: JSON.stringify(sess),
            expire: this.expiryOf(sess),
          }),
        cb
      );
    }

    touch(sid, sess, cb) {
      return reporting(() => this.stmts.touch.run(this.expiryOf(sess), sid), cb);
    }

    destroy(sid, cb) {
      return reporting(() => this.stmts.destroy.run(sid), cb);
    }

    clear(cb) {
      return reporting(() => this.stmts.clear.run(), cb);
    }

    length(cb) {
      try {
        return cb(null, this.stmts.length.get().n);
      } catch (err) {
        return cb(err);
      }
    }

    /**
     * Delete expired rows now.
     */
    prune() {
      try {
        this.stmts.prune.run(Date.now());
      } catch (_err) {
        // A prune failure is not fatal
      }
    }

    /**
     * Stop the timer. Used for a clean shutdown.
     */
    close() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
  }

  return SqliteSessionStore;
};
