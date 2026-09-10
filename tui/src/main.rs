mod app;
mod client;
mod library;
mod pair;
mod player;
mod session;
mod theme;

fn main() {
    if let Err(err) = app::run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::session::pair_url;

    #[test]
    fn pair_url_has_token() {
        let url = pair_url("192.168.1.8", 7420, "deadbeef");
        assert_eq!(url, "nlc://192.168.1.8:7420/pair?token=deadbeef");
    }
}
