// opts exports the plots options
var opts = (function () {

    // Removes the legend at the plot bottom and shows values on the right.
    function legendAsTooltipPlugin({ className, style = { backgroundColor: "rgba(255, 249, 196, 0.92)", color: "black" } } = {}) {
        let legendEl;

        function init(u, opts) {
            legendEl = u.root.querySelector(".u-legend");

            legendEl.classList.remove("u-inline");
            className && legendEl.classList.add(className);

            uPlot.assign(legendEl.style, {
                textAlign: "left",
                pointerEvents: "none",
                display: "none",
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: 100,
                boxShadow: "2px 2px 10px rgba(0,0,0,0.5)",
                ...style
            });

            // hide series color markers
            const idents = legendEl.querySelectorAll(".u-marker");

            for (let i = 0; i < idents.length; i++)
                idents[i].style.display = "none";

            const overEl = u.root.querySelector(".u-over");
            overEl.style.overflow = "visible";

            // move legend into plot bounds
            overEl.appendChild(legendEl);

            // show/hide tooltip on enter/exit
            overEl.addEventListener("mouseenter", () => { legendEl.style.display = null; });
            overEl.addEventListener("mouseleave", () => { legendEl.style.display = "none"; });

            // let tooltip exit plot
            //	overEl.style.overflow = "visible";
        }

        function update(u) {
            const { left, top } = u.cursor;
            legendEl.style.transform = "translate(" + left + "px, " + top + "px)";
        }

        return {
            hooks: {
                init: init,
                setCursor: update,
            }
        };
    }

    function humanFileSize(bytes, si = false, dp = 1) {
        const thresh = si ? 1000 : 1024;

        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }

        const units = si
            ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
            : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        let u = -1;
        const r = 10 ** dp;

        do {
            bytes /= thresh;
            ++u;
        } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

        return bytes.toFixed(dp) + ' ' + units[u];
    }

    function valueFmt(u, v) {
        return humanFileSize(v, true);
    }

    const cursorOpts = {
        lock: true,
        focus: {
            prox: 16,
        },
        points: {
            show: false,
        },
        sync: {
            key: "ts",
            setSeries: true,
        },
    };

    function gcLinesPlugin() {
        return {
            hooks: {
                draw: u => {
                    const { ctx } = u;
                    const gcs = stats.lastGCs;
                    const mints = u.data[0][0];
                    const maxts = u.data[0][u.data[0].length - 1];
                    const y0 = u.valToPos(u.scales['b'].min, 'b', true);
                    const y1 = u.valToPos(u.scales['b'].max, 'b', true);

                    for (let i = 0, n = gcs.length; i < n; i++) {
                        const ts = gcs[i];
                        if (ts < mints || ts > maxts) {
                            continue;
                        }

                        const x = u.valToPos(ts, 'x', true);
                        ctx.beginPath();
                        ctx.moveTo(x, y0);
                        ctx.lineTo(x, y1);
                        ctx.setLineDash([5, 10]);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'grey';
                        ctx.stroke();
                    }
                }
            }
        };
    }

    function getSize() {
        return {
            width: 950,
            height: 400,
        }
    }

    const opts1 = {
        title: "Heap",
        ...getSize(),
        cursor: cursorOpts,
        plugins: [
            gcLinesPlugin(),
            legendAsTooltipPlugin(),
        ],
        series: [
            {},
            {
                label: "HeapAlloc",
                scale: "b",
                value: valueFmt,
                stroke: "red",
                points: {
                    show: true,
                    size: 3,
                    fill: "red",
                },
            },
            {
                label: "HeapSys",
                scale: "b",
                value: valueFmt,
                stroke: "blue",
                points: {
                    show: true,
                    size: 3,
                    fill: "blue",
                },
            },
            {
                label: "HeapIdle",
                scale: "b",
                value: valueFmt,
                stroke: "green",
                points: {
                    show: true,
                    size: 3,
                    fill: "green",
                },
            },
            {
                label: "HeapInuse",
                scale: "b",
                value: valueFmt,
                stroke: "orange",
                points: {
                    show: true,
                    size: 3,
                    fill: "orange",
                },
            },
        ],
        axes: [
            {
                values: (u, vals, space) => vals.map(v => formatAxisTimestamp(v)),
                rotate: 50,
            },
            {
                scale: 'b',
                values: (u, vals, space) => vals.map(v => humanFileSize(v, true, 0)),
                size: 90,
            },
        ],
    };

    // formatAxisTimestamp formats a given Unix epoch timestamp for printing
    // along an axis. It prints:
    //  - `hh:mm:ss` if ss is a multiple of 5s,
    //  - only `ss` otherwise
    function formatAxisTimestamp(ts) {
        let d = new Date(ts * 1000);
        let s = d.getSeconds()
        let ss = s.toString().padStart(2, '0')

        if (s % 5 != 0) {
            return ss
        }

        let hh = d.getHours().toString().padStart(2, '0')
        let mm = d.getMinutes().toString().padStart(2, '0')
        return hh + ':' + mm + ':' + ss
    }

    function heatmapPlugin() {
        // let global min/max
        function fillStyle(count, maxCount) {
            const norm = count / maxCount;

            // salmon
            // const r = 254 - (24 * norm);
            // const g = 230 - (145 * norm);
            // const b = 206 - (193 * norm);

            // purple
            const r = 239 - (122 * norm);
            const g = 237 - (120 * norm);
            const b = 245 - (68 * norm);
            return `rgba(${r}, ${g}, ${b}, 1)`;
        }

        return {
            hooks: {
                draw: u => {
                    const { ctx, data } = u;

                    let yData = data[3];
                    let yQtys = data[4];

                    let iMin = u.scales.x.min;
                    let iMax = u.scales.x.max;

                    const rectw = u.bbox.width / (iMax - iMin);
                    const recth = u.bbox.height / stats.classSizes.length;

                    let maxCount = -Infinity;

                    yQtys.forEach(qtys => {
                        maxCount = Math.max(maxCount, Math.max.apply(null, qtys));
                    });

                    yData.forEach((yVals, xi) => {
                        let xPos = u.valToPos(data[0][xi], 'x', true);
                        xPos = xPos - rectw;

                        yVals.forEach((yVal, yi) => {
                            const count = yQtys[xi][yi];
                            if (count == 0) {
                                // Skip empty size classes
                                return;
                            }
                            const yPos = Math.round(u.valToPos(yVal, 'y', true));
                            ctx.fillStyle = fillStyle(count, maxCount);
                            ctx.fillRect(xPos, yPos, rectw, recth);
                            ctx.strokeRect(xPos, yPos, rectw, recth);
                        });
                    });
                }
            }
        };
    }

    // column-highlights the hovered x index
    function columnHighlightPlugin({ className, style = { backgroundColor: "rgba(51, 51, 51, 0.1)" } } = {}) {
        let underEl, overEl, highlightEl, currIdx;

        function init(u) {
            underEl = u.root.querySelector(".u-under");
            overEl = u.root.querySelector(".u-over");

            highlightEl = document.createElement("div");

            className && highlightEl.classList.add(className);

            uPlot.assign(highlightEl.style, {
                pointerEvents: "none",
                display: "none",
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                ...style
            });

            overEl.appendChild(highlightEl);

            // show/hide highlight on enter/exit
            overEl.addEventListener("mouseenter", () => { highlightEl.style.display = null; });
            overEl.addEventListener("mouseleave", () => { highlightEl.style.display = "none"; });
        }

        function update(u) {
            if (currIdx !== u.cursor.idx) {
                currIdx = u.cursor.idx;
                const dx = u.scales.x.max - u.scales.x.min;
                const width = (u.bbox.width / dx) / devicePixelRatio;
                const xVal = u.data[0][currIdx];
                const left = u.valToPos(xVal, "x") - width;

                highlightEl.style.transform = "translateX(" + Math.round(left) + "px)";
                highlightEl.style.width = Math.round(width) + "px";
            }
        }

        return {
            opts: (u, opts) => {
                uPlot.assign(opts, {
                    cursor: {
                        x: false,
                        y: false,
                    }
                });
            },
            hooks: {
                init: init,
                setCursor: update,
            }
        };
    }

    const opts2 = {
        title: "Size classes Heatmap",
        ...getSize(),
        cursor: cursorOpts,
        plugins: [
            heatmapPlugin(),
            columnHighlightPlugin(),
        ],
        series: [
            {
                scale: 'x',
            },
            {
                paths: () => null,
                points: { show: false },
                scale: 'y',
            },
            {
                paths: () => null,
                points: { show: false },
                scale: 'y',
            },
        ],
        axes: [
            {
                scale: 'x',
                values: (u, vals, space) => vals.map(v => formatAxisTimestamp(v)),
                rotate: 50,
            },
            {
                scale: 'y',
                values: (u, vals, space) => vals.map(function (i) {
                    if (i > stats.classSizes.length - 1) {
                        return '';
                    }
                    return humanFileSize(stats.classSizes[i], true, 0);
                }),
                size: 90,
            },
        ],
    };

    return {
        heap: opts1,
        bySizes: opts2,
    }
}());
