async function test() {
  const res = await fetch("http://35.255.95.161:3001/api/inbox");
  const items = await res.json();
  console.log("Total items:", items.length);
  items.forEach((it, i) => {
    console.log(i, "ID:", it.id, "Time:", it.created_at, "Name:", it.sender_name);
    console.log("   Text:", (it.raw_text || "").replace(/\n/g, " ").slice(0, 100));
  });
}
test();
