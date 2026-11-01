import sqlite3
con = sqlite3.connect('/home/z/my-project/db/custom.db')
cur = con.cursor()
cur.execute("UPDATE Portal SET status='ERROR', lastError='sync interrupted (server restart)' WHERE status='SYNCING'")
cur.execute("UPDATE SyncLog SET status='ERROR', finishedAt=CURRENT_TIMESTAMP, message='interrupted by server restart' WHERE status='RUNNING'")
con.commit()
print("stuck portals reset:", cur.rowcount)
con.close()
