import { Grid } from './components/Grid';

function App() {
  return (
    <div className="h-full w-full flex flex-col bg-ui-bg">
      {/* Grid now includes MenuBar via SpreadsheetContext.Provider */}
      <Grid />
    </div>
  );
}

export default App;
