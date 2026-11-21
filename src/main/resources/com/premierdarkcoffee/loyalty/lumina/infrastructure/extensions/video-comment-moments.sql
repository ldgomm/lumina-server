CREATE TABLE video_comment_moments (
  comment_id TEXT PRIMARY KEY REFERENCES piece_comments(id),
  seconds INTEGER NOT NULL CHECK(seconds >= 0)
) STRICT;
