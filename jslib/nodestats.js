class NodeStats {
    constructor() {

    }

 /*   collect(ledger, config) {
        if(!config.getStatsIntervalSmall().equals(smallInterval) || !config.getStatsIntervalBig().equals(bigInterval)) {
            //intervals changed. need to reset node
            init(ledger,config);
            return false;
        }

        ZonedDateTime now = ZonedDateTime.now();
        Map<ItemState, Integer> lastIntervalStats = ledger.getLedgerSize(lastStatsBuildTime);
        ledgerStatsHistory.addLast(lastIntervalStats);
        ledgerHistoryTimestamps.addLast(lastStatsBuildTime);

        smallIntervalApproved = lastIntervalStats.getOrDefault(ItemState.APPROVED,0)+lastIntervalStats.getOrDefault(ItemState.REVOKED,0);
        bigIntervalApproved += smallIntervalApproved;
        uptimeApproved += smallIntervalApproved;

        lastIntervalStats.keySet().forEach(is -> ledgerSize.put(is, ledgerSize.getOrDefault(is,0) + lastIntervalStats.get(is)));

        while (ledgerHistoryTimestamps.getFirst().plus(bigInterval).isBefore(now)) {
            ledgerHistoryTimestamps.removeFirst();
            bigIntervalApproved -= ledgerStatsHistory.removeFirst().get(ItemState.APPROVED) + lastIntervalStats.getOrDefault(ItemState.REVOKED,0);
        }

        lastStatsBuildTime = now;



        Map<Integer, Integer> payments = ledger.getPayments(now.truncatedTo(ChronoUnit.DAYS).minusDays(now.getDayOfMonth()-1).minusMonths(1));
        payments.keySet().forEach( day -> {
        });
        return true;
    }

    init(ledger, config) {
        ledgerStatsHistory.clear();
        ledgerHistoryTimestamps.clear();

        smallIntervalApproved = 0;
        bigIntervalApproved = 0;
        uptimeApproved = 0;

        bigInterval = config.getStatsIntervalBig();
        smallInterval = config.getStatsIntervalSmall();
        nodeStartTime = ZonedDateTime.now();
        lastStatsBuildTime = nodeStartTime;
        ledgerSize = ledger.getLedgerSize(null);

        DateTimeFormatterBuilder builder = new DateTimeFormatterBuilder();
        builder.appendValue(ChronoField.DAY_OF_MONTH,2);
        builder.appendLiteral("/");
        builder.appendValue(ChronoField.MONTH_OF_YEAR,2);
        builder.appendLiteral("/");
        builder.appendValue(ChronoField.YEAR,4);
        formatter = builder.toFormatter();
    }

    getPaymentStats(ledger, daysNum) {
        List<Binder> result = new ArrayList<>();
        ZonedDateTime now = ZonedDateTime.now();
        Map<Integer, Integer> payments = ledger.getPayments(now.truncatedTo(ChronoUnit.DAYS).minusDays(daysNum));
        payments.keySet().forEach( day -> {
            result.add(Binder.of("date",ZonedDateTime.ofInstant(Instant.ofEpochSecond(day), ZoneId.systemDefault()).format(formatter), "units",payments.get(day)));
        });
        return result;
    }*/
}

module.exports = {NodeStats};