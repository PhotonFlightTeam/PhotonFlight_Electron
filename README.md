# PhotonFlight_Electron
Repository for the electron application for PhotonFlight. This application utilizes JS React for the front end.  

To run the application:  
1. cd into /PhotonFlight  
2. run npm install  
3. run npm start

## Testing

Run the renderer and color utility tests with `npm test`. The Vitest worker count
is capped to keep parallel test processes within typical developer-machine
memory limits.

Run the Electron end-to-end workflow with `npm run test:e2e`. It starts the
actual Electron app with a temporary user profile and drives the app through
Playwright. Configure `VITE_CLERK_PUBLISHABLE_KEY` in the app's `.env` as for
`npm start`; the tests use the signed-out/offline path and do not need a Clerk
account or a database. The runner requires Node.js 22 or later and the
Electron app must be able to start on the current desktop session.

The end-to-end checks are:

1. **Guest entry:** verifies the signed-out window offers Sign In and Offline
   Mode, then confirms Offline Mode mounts the real viewer and its canvas. This
   checks the authentication-to-workspace transition using the production
   renderer and preload rather than a mocked component.
2. **Viewer controls:** changes the view-color selection and reaches the zoom
   maximum through the visible controls. This checks that the controls remain
   connected to the viewer state and enforce the UI's upper bound.
3. **Plugin menu:** opens the plugin sidebar from the native Plugins > Library
   menu and closes it from the sidebar. This covers the application-menu event,
   preload bridge, and renderer listener as one path.
4. **LAS/LAZ round trip:** uses the native File > Import and File > Export menu
   handlers with the small LAS 1.3 LAZ sample, then checks the written LAS 1.2
   header and nonzero point count. This exercises file dialogs, IPC file reads
   and writes, parsing, and the LAZ-to-LAS conversion together.
5. **Renderer health:** checks that no uncaught JavaScript errors occurred
   during the workflow. This catches runtime failures that can leave the UI
   looking partly functional while breaking later actions.

Run backend API tests from the PhotonFlight directory after activating the
backend environment:

```powershell
.\src\backend\venv\Scripts\Activate.ps1
python -m pytest -q src\backend\tests
```

Those tests mock database connections and exercise API behavior, not an actual
PostgreSQL server.

### Coverage review

| Existing test file | What it checks today | Remaining gaps |
|---|---|---|
| `OAuth.test.jsx` | Signed-out choices, Clerk registration and failure handling, guest entry/sign-out, and the loading state. | Authentication is mocked. The Settings assertion is pending because the renderer has no Settings listener. |
| `DatabaseBrowser.test.jsx` | Menu-open loading, map selection, pagination, map creation, multipart upload, download-to-viewer callback, API error/retry, and event cleanup. | Fetch and Clerk are mocked; no live API, database, or signed-in Electron session. |
| `lasReader.test.jsx` | Viewer layout, tool/mode selection, zoom limits, and import/export listener cleanup. Canvas, plugin/database panels, tools, and export are isolated from this component test. | Native menu and file transfer behavior is covered by the new E2E workflow; 3D tools remain mocked here. |
| `PointCloudViewer.test.jsx` | Successful parsing, base/height/slope colors, no-file behavior, and parse failures. | Loader calls are mocked; the E2E import/export test supplies a real sample file. |
| `ViewControls.test.jsx` | Top-view keyboard shortcut and slider zoom request. | Other axis/arrow-key combinations and mouse orbit behavior are not covered. |
| `ToolBar.test.jsx` | Each toolbar button selects its corresponding tool. | No additional gaps for this small component. |
| `MeasureTool.test.jsx` | Mocked ray intersections, segment length, deletion, and inactive-tool behavior. | Does not exercise actual Three.js raycasting against a loaded cloud. |
| `Pin.test.jsx` | Mocked ray intersections, pin display/clear, and inactive-tool behavior. | Does not exercise actual Three.js raycasting against a loaded cloud. |
| `PluginLibrary.test.jsx` | Plugin image and initial-letter fallback rendering. | Search, import, enable/disable, removal, and failure paths remain untested. |
| `renderer.test.jsx` | Root mount with React Strict Mode and the Clerk provider. | Clerk itself and the Electron preload are mocked. |
| `colorCircle.test.ts` | Radius boundary behavior and geometry/store color updates, including missing state. | No end-user UI flow invokes these color-area operations. |
| `colorSquare.test.ts` | Rectangle boundary behavior and geometry/store color updates, including missing state. | No end-user UI flow invokes these color-area operations. |
| `heightMap.test.ts` | Minimum/maximum interpolation and constant-height input. | No additional gaps for the current helper. |
| `slopeMap.test.ts` | Neighborhood slope mapping and isolated-point behavior. | No additional gaps for the current helper. |
| `test_auth.py` | Bearer/JWT validation, required configuration, Clerk `sub` to database-user mapping, invalid subject, issuer derivation, and CORS. | JWT and database operations are mocked; real Clerk keys/JWKS are not contacted. |
| `test_maps.py` | Health, map listing/get/create, owner scoping, input validation, conflicts, and database-error handling. | Database connections are mocked; PostgreSQL query semantics are not exercised. |
| `test_lidar.py` | Upload validation, metadata/hash storage, ownership, listing, download bytes, and not-found behavior. | Database connections are mocked; no real database or stored-file round trip. |

Two assertions needed updating as the current app changed: Offline Mode now
opens an empty viewer instead of preloading `CO_test1.laz`, and the old
Settings-window assertion referred to a renderer feature that is not present.
The Settings test is kept as a todo because the native menu and preload still
emit the Settings event, but no current renderer subscribes to it. This is a
product behavior gap, not a passing Settings test.

The backend tests previously imported through a stale `git.PhotonFlight`
package path, and the auth tests expected the older email-claim identity model.
They now import the project-local `src.backend.app` package and assert the
current Clerk `sub`-based identity behavior.
The new end-to-end checks fill the main gap in the previous suites: no test
launched Electron and covered the actual renderer/preload/native-menu/file-I/O
flow.

Remaining gaps include the Settings menu behavior, real Clerk sign-in and
token provisioning, an actual PostgreSQL integration, direct camera movement
keyboard coverage, and plugin enable/remove/import operations. Those are not
replaced by the offline, mocked, or empty-plugin E2E path.

## Database Lidar Browser

The File > Database menu is enabled for signed-in Clerk users and disabled in
offline/guest mode. The browser requests lidar records through the local API;
the API verifies the Clerk session token and matches its `sub` claim to
`app_user.clerk_user_id` before returning only records uploaded by that
database user.

The backend reads `VITE_CLERK_PUBLISHABLE_KEY` from `PhotonFlight/.env` and
derives the issuer and JWKS URL from the Clerk domain encoded in that key.
Optionally override these with `CLERK_ISSUER` and `CLERK_JWKS_URL` in
`PhotonFlight/src/backend/.env`. The renderer requests a Clerk JWT template
named `photonflight`. The API validates the token issuer and signing key, then
maps its standard `sub` claim to `app_user.clerk_user_id`. The `/api/users/me`
provisioning request sends the user's name and email separately; email claims
and verified-email matching are not used to identify database users.

## Movement Controls:  
Movement can be done with both mouse and keyboard inputs. 
    
For key controls you must hold x, y, or z and an arrow key. 
The letter is the axis  
up/down arrows are changes in camera position  
right/left arrows are changes in camera focus  
(Essentialluy up/down moves along an axis, right/left rotates on an axis)

There are also default positions created for each axis clicking the indicated character jumps to these positions:  
- +z t -topdown view  
- -z b -bottomup view
- +x f -front to back view
- -x v -back to front view
- +y r -right to left view
- -y l -left to right view

## Keymaps: 

When in measurement mode: 
- d -deletes the last line created

When in pin mode: 
- d -deletes all of the currently displayed pins 



Updates Needed:  
- ~~Allowing inputting a file rather than using default .laz~~
- ~~Create view controls~~
- More options for basic color variations
- ~~Creation of a measuring tool~~
- Portal for interacting with plugins

The JS library for interpreting .las files only supports versions <=1.3; v1.4 files currently need to be converted.  
To do convert a file, follow this sequence:  
1. cd into /LasEditor
2. pip install -r requirements.txt
3. python convert.py