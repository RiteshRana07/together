"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Nav from "../../components/Nav";

import {
  useCurrentUser,
} from "../../lib/use-current-user";

/* =========================================================
   HELPERS
========================================================= */

function mb(bytes) {
  return (
    Number(bytes || 0) /
    (1024 * 1024)
  );
}

function formatMB(bytes) {
  const value =
    mb(bytes);

  return value >= 10
    ? value.toFixed(0)
    : value.toFixed(1);
}

/* =========================================================
   UPLOAD
========================================================= */

async function uploadToPCloud(
  file,
  title,
  onProgress
) {
  /*
   * STEP 1:
   * Ask our server for a direct pCloud Upload Link URL.
   * No video bytes are sent to Railway.
   */
  const prepareResponse = await fetch(
    "/api/storage/upload",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    }
  );

  const prepareText = await prepareResponse.text();
  let prepare = {};

  try {
    prepare = JSON.parse(prepareText || "{}");
  } catch {
    throw new Error(
      `Upload preparation returned invalid JSON (HTTP ${prepareResponse.status}).`
    );
  }

  if (!prepareResponse.ok || !prepare.ok) {
    throw new Error(
      prepare.error ||
        `Could not prepare pCloud upload (HTTP ${prepareResponse.status}).`
    );
  }

  /*
   * STEP 2:
   * Upload the video directly from the browser to pCloud.
   *
   * This is the important Railway/Vercel fix:
   * Railway never receives the multi-GB video body.
   */
  const uploadResult = await new Promise(
    (resolve, reject) => {
      const formData = new FormData();

      formData.append(
        "file",
        file,
        prepare.filename || file.name
      );

      const xhr = new XMLHttpRequest();

      xhr.open(
        "POST",
        prepare.uploadUrl,
        true
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded);

          console.log(
            "[library] direct pCloud upload progress:",
            {
              uploaded: event.loaded,
              total: event.total,
              percentage: Math.round(
                (event.loaded / event.total) * 100
              ),
            }
          );
        }
      };

      xhr.onload = () => {
        let data = {};

        try {
          data = JSON.parse(
            xhr.responseText || "{}"
          );
        } catch {
          reject(
            new Error(
              `pCloud returned invalid JSON (HTTP ${xhr.status}).`
            )
          );
          return;
        }

        if (
          xhr.status < 200 ||
          xhr.status >= 300 ||
          Number(data.result) !== 0
        ) {
          reject(
            new Error(
              data.error ||
                `pCloud upload failed (HTTP ${xhr.status}, result ${data.result ?? "unknown"}).`
            )
          );
          return;
        }

        resolve(data);
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "Network error while uploading directly to pCloud."
          )
        );
      };

      xhr.onabort = () => {
        reject(
          new Error(
            "Video upload was cancelled."
          )
        );
      };

      xhr.send(formData);
    }
  );

  console.log(
    "[library] pCloud direct upload completed:",
    uploadResult
  );

  onProgress?.(file.size);

  /*
   * STEP 3:
   * Ask our server to find the uploaded file in /WatchTogether,
   * move it into the user's folder, and return its permanent
   * pCloud file reference.
   */
  const finalizeResponse = await fetch(
    "/api/storage/upload/complete",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        objectName: prepare.objectName,
        filename: file.name,
        title,
      }),
    }
  );

  const finalizeText =
    await finalizeResponse.text();

  let finalized = {};

  try {
    finalized = JSON.parse(
      finalizeText || "{}"
    );
  } catch {
    throw new Error(
      `Upload finalization returned invalid JSON (HTTP ${finalizeResponse.status}).`
    );
  }

  if (
    !finalizeResponse.ok ||
    !finalized.ok
  ) {
    throw new Error(
      finalized.error ||
        `Could not finalize pCloud upload (HTTP ${finalizeResponse.status}).`
    );
  }

  return finalized;
}

/* =========================================================
   LIBRARY PAGE
========================================================= */

export default function LibraryPage() {
  const user =
    useCurrentUser();

  const [
    movies,
    setMovies,
  ] = useState(
    undefined
  );

  const [
    showForm,
    setShowForm,
  ] = useState(
    false
  );

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    file,
    setFile,
  ] = useState(
    null
  );

  const [
    busy,
    setBusy,
  ] = useState(
    false
  );

  const [
    progressBytes,
    setProgressBytes,
  ] = useState(
    0
  );

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  /* =======================================================
     PROGRESS
  ======================================================= */

  const progressPercent =
    useMemo(() => {
      if (
        !file?.size
      ) {
        return 0;
      }

      return Math.min(
        100,
        (
          progressBytes /
          file.size
        ) * 100
      );
    }, [
      file,
      progressBytes,
    ]);

  /* =======================================================
     LOAD MOVIES
  ======================================================= */

  async function loadMovies({ preservePlaybackUrls = true } = {}) {
    try {
      const response = await fetch("/api/movies", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("Failed to load movies:", data.error);
        return;
      }

      const incoming = data.movies || [];

      setMovies((previous) => {
        if (!preservePlaybackUrls || !Array.isArray(previous)) {
          return incoming;
        }

        const previousById = new Map(previous.map((m) => [String(m.id), m]));
        return incoming.map((movie) => {
          const old = previousById.get(String(movie.id));
          // Do not replace a currently playing signed URL during a background
          // pCloud existence check. Replacing src makes <video> reload.
          if (old?.video_url && old.video_url !== movie.storage_ref && movie.storage_ref) {
            return { ...movie, video_url: old.video_url };
          }
          return movie;
        });
      });
    } catch (error) {
      console.error("Failed to load movies:", error);
    }
  }

  /* =======================================================
     SAVE MOVIE IN DATABASE
  ======================================================= */

  async function saveMovie(
    titleValue,
    storageRefValue
  ) {
    const response =
      await fetch(
        "/api/movies",
        {
          method:
            "POST",

          credentials:
            "include",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              title:
                titleValue,

              videoUrl:
                storageRefValue,
            }),
        }
      );

    const text =
      await response.text();

    let data = {};

    try {
      data =
        JSON.parse(
          text || "{}"
        );
    } catch {
      throw new Error(
        `Movie API returned invalid JSON (HTTP ${response.status})`
      );
    }

    if (
      !response.ok
    ) {
      throw new Error(
        data.error ||
        "Couldn't save the video to your library."
      );
    }

    return data.movie;
  }

  /* =======================================================
     INITIAL LOAD + QUIET BACKGROUND SYNC
  ======================================================= */

  useEffect(() => {
    if (!user) return;

    loadMovies({ preservePlaybackUrls: false });

    // Keep external pCloud deletion detection, but do not refresh the video
    // element's src. The merge logic above preserves existing playback URLs.
    const syncTimer = setInterval(() => {
      loadMovies({ preservePlaybackUrls: true });
    }, 60000);

    const onFocus = () => loadMovies({ preservePlaybackUrls: true });
    window.addEventListener("focus", onFocus);

    try {
      const pending = JSON.parse(localStorage.getItem("wt_pending_movie") || "null");
      if (pending?.title && pending?.storageRef) {
        saveMovie(pending.title, pending.storageRef)
          .then(() => {
            localStorage.removeItem("wt_pending_movie");
            return loadMovies({ preservePlaybackUrls: true });
          })
          .catch(console.error);
      }
    } catch (error) {
      console.error("Pending movie recovery failed:", error);
    }

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  async function refreshMoviePlayback(movieId) {
    try {
      const response = await fetch("/api/storage/download-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Couldn't refresh the video link.");
      }
      setMovies((previous) => (previous || []).map((movie) =>
        String(movie.id) === String(movieId)
          ? { ...movie, video_url: data.url }
          : movie
      ));
      return data.url;
    } catch (error) {
      console.error("[library] playback URL refresh failed:", error);
      return null;
    }
  }

  /* =======================================================
     RESET
  ======================================================= */

  function resetUpload() {
    setTitle("");

    setFile(null);

    setProgressBytes(
      0
    );

    setError("");

    setSuccess("");

    setShowForm(
      false
    );
  }

  /* =======================================================
     UPLOAD
  ======================================================= */

  async function handleUpload(
    event
  ) {
    event.preventDefault();

    setError("");

    setSuccess("");

    if (
      !title.trim()
    ) {
      setError(
        "Give the movie a title."
      );

      return;
    }

    if (!file) {
      setError(
        "Choose a video file."
      );

      return;
    }

    setBusy(true);

    setProgressBytes(
      0
    );

    try {
      console.log(
        "[library] starting upload:",
        {
          userId:
            user?.userId,

          username:
            user?.username,

          filename:
            file.name,

          size:
            file.size,

          type:
            file.type,
        }
      );

      /*
       * Upload to the logged-in user's pCloud folder.
       */
      const result =
        await uploadToPCloud(
          file,
          title.trim(),
          (uploaded) => {
            setProgressBytes(
              uploaded
            );
          }
        );

      console.log(
        "[library] upload result:",
        result
      );

      const storageRef =
        result.storageRef;

      if (
        !storageRef
      ) {
        throw new Error(
          "pCloud upload completed but no storage reference was returned."
        );
      }

      /*
       * Save recovery information.
       */
      localStorage.setItem(
        "wt_pending_movie",
        JSON.stringify({
          title:
            title.trim(),

          storageRef,
        })
      );

      /*
       * Save movie in application database.
       */
      await saveMovie(
        title.trim(),
        storageRef
      );

      /*
       * Database succeeded.
       */
      localStorage.removeItem(
        "wt_pending_movie"
      );

      setProgressBytes(
        file.size
      );

      setSuccess(
        `Movie uploaded successfully to ${result.folderName} folder and added to your library.`
      );

      await loadMovies();

      /*
       * Clear form but keep success message.
       */
      setTitle("");

      setFile(null);

      setProgressBytes(
        0
      );

      setShowForm(
        false
      );
    } catch (error) {
      console.error(
        "[library] upload error:",
        error
      );

      setError(
        error?.message ||
        "Something went wrong while uploading."
      );
    } finally {
      setBusy(false);
    }
  }

  /* =======================================================
     DELETE MOVIE
  ======================================================= */

  async function handleDelete(
    id
  ) {
    if (
      !confirm(
        "Remove this movie from your library?"
      )
    ) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/movies/${id}`,
          {
            method:
              "DELETE",

            credentials:
              "include",
          }
        );

      if (
        !response.ok
      ) {
        const data =
          await response
            .json()
            .catch(
              () => ({})
            );

        alert(
          data.error ||
          "Couldn't remove the movie."
        );

        return;
      }

      await loadMovies();
    } catch (error) {
      alert(
        error?.message ||
        "Couldn't remove the movie."
      );
    }
  }

  /* =======================================================
     NOT LOGGED IN
  ======================================================= */

  if (!user) {
    return null;
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="wt-page">
      <Nav username={user.username}/>
      <div className="wt-shell py-10 sm:py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
          <div><p className="eyebrow">YOUR COLLECTION</p><h1 className="font-display text-5xl mt-2">The shelves are yours.</h1><p className="text-sm text-white/40 mt-3">Your uploaded videos live in pCloud and stay ready for private screenings.</p></div>
          <button onClick={()=>setShowForm(v=>!v)} disabled={busy} className="wt-button wt-button-primary">+ Upload movie</button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mb-5"><div className="wt-card p-5"><p className="eyebrow">VIDEOS</p><p className="text-3xl font-semibold mt-4">{movies?.length||0}</p><p className="text-xs text-white/30 mt-1">ready to screen</p></div><div className="wt-card p-5"><p className="eyebrow">STORAGE</p><p className="text-3xl font-semibold mt-4">pCloud</p><p className="text-xs text-white/30 mt-1">direct browser upload</p></div><div className="wt-card p-5"><p className="eyebrow">NEXT STEP</p><p className="text-sm font-medium mt-5">Pick a video → create a room.</p><p className="text-xs text-white/30 mt-1">Playback stays outside the app server.</p></div></div>
        {success&&<div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>}
        {showForm&&<form onSubmit={handleUpload} className="wt-card p-6 mb-6 grid lg:grid-cols-[1fr_1fr_auto] gap-4 items-end"><div><label className="text-xs uppercase tracking-[.18em] text-white/40">Movie title</label><input className="wt-input mt-2" placeholder="My movie night" value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></div><div><label className="text-xs uppercase tracking-[.18em] text-white/40">Video file</label><input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)} className="wt-input mt-2 text-sm"/></div><button type="submit" disabled={busy||!file||!title.trim()} className="wt-button wt-button-primary">{busy?`Uploading ${Math.round(progressPercent)}%`:'Add to library'}</button>{file&&busy&&<div className="lg:col-span-3"><div className="flex justify-between text-xs text-white/35 mb-2"><span>Uploading directly to pCloud</span><span>{formatMB(progressBytes)} / {formatMB(file.size)} MB</span></div><div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-[#d95b55]" style={{width:`${progressPercent}%`}}/></div></div>}{error&&<div className="lg:col-span-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}</form>}
        {movies===undefined?<div className="wt-card p-16 text-center text-white/30">Loading your shelf…</div>:movies.length===0?<div className="wt-card p-16 text-center"><div className="brand-mark mx-auto">V</div><h2 className="font-display text-4xl mt-5">Nothing on the shelves yet.</h2><p className="text-sm text-white/35 mt-2">Upload your first video to make it available for a private room.</p></div>:<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{movies.map(movie=><article key={movie.id} className="wt-card overflow-hidden group"><div className="aspect-video bg-black"><video className="w-full h-full object-contain" controls preload="metadata" playsInline referrerPolicy="no-referrer" src={movie.video_url} onError={async e=>{if(e.currentTarget.dataset.retry==='1')return;e.currentTarget.dataset.retry='1';const u=await refreshMoviePlayback(movie.id);if(u)e.currentTarget.src=u}}>Your browser does not support video playback.</video></div><div className="p-5"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-medium truncate" title={movie.title}>{movie.title}</p><p className="text-xs text-white/30 mt-1">Ready for a watch room</p></div><span className="status-pill">LIBRARY</span></div><div className="flex gap-2 mt-5"><Link href={`/rooms/create?movieId=${encodeURIComponent(movie.id)}`} className="wt-button wt-button-primary flex-1 text-center !py-2">Use in room</Link><button onClick={()=>handleDelete(movie.id)} className="wt-button wt-button-ghost !py-2">Remove</button></div></div></article>)}</div>}
      </div>
    </main>
  );
}
