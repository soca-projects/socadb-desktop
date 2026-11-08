// Undo and Redo stay out: WebView2 greys them, as fields run their own history.
const KEPT_ITEMS: [&str; 5] = ["cut", "copy", "paste", "selectAll", "spellCheck"];

// WebView2 only documents a few of these names, so a menu with none of the kept ones
// is left whole, not emptied.
pub fn items_to_remove(names: &[Option<String>]) -> Vec<u32> {
    let kept = |name: &str| KEPT_ITEMS.contains(&name);
    if !names.iter().flatten().any(|name| kept(name)) {
        return Vec::new();
    }
    let mut doomed: Vec<u32> = (0u32..)
        .zip(names)
        .filter_map(|(index, name)| {
            name.as_deref()
                .is_some_and(|name| !kept(name))
                .then_some(index)
        })
        .collect();
    doomed.reverse();
    doomed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(items: &[&str]) -> Vec<Option<String>> {
        items.iter().map(|item| Some((*item).to_string())).collect()
    }

    #[test]
    fn keeps_only_the_editing_items_removing_from_the_end() {
        let menu = names(&[
            "undo",
            "redo",
            "separator",
            "cut",
            "copy",
            "paste",
            "separator",
            "selectAll",
            "emoji",
            "writingDirection",
        ]);
        assert_eq!(items_to_remove(&menu), vec![9, 8, 6, 2, 1, 0]);
    }

    #[test]
    fn keeps_spelling_suggestions() {
        let menu = names(&["spellCheck", "copy", "emoji"]);
        assert_eq!(items_to_remove(&menu), vec![2]);
    }

    #[test]
    fn leaves_a_menu_it_does_not_recognize_whole() {
        assert!(items_to_remove(&names(&["emoji", "somethingNew"])).is_empty());
    }

    #[test]
    fn keeps_an_item_whose_name_cannot_be_read() {
        let mut menu = names(&["copy", "emoji"]);
        menu.push(None);
        assert_eq!(items_to_remove(&menu), vec![1]);
    }
}
